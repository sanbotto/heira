const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("HeiraInheritanceEscrow", function () {
    let factory;
    let escrow;
    let owner;
    let beneficiary1;
    let beneficiary2;
    let mockToken;
    let coinbaseTrade;

    const BASIS_POINTS = 10000;
    const INACTIVITY_PERIOD = 90 * 24 * 60 * 60; // 90 days in seconds

    beforeEach(async function () {
        [owner, beneficiary1, beneficiary2] = await ethers.getSigners();

        // Deploy factory
        const Factory = await ethers.getContractFactory("HeiraInheritanceEscrowFactory");
        factory = await Factory.deploy();
        await factory.waitForDeployment();

        // Deploy mock ERC20 token
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        mockToken = await MockERC20.deploy("Test Token", "TEST", ethers.parseEther("1000000"));
        await mockToken.waitForDeployment();

        // Deploy mock Coinbase Trade (simplified)
        const MockCoinbaseTrade = await ethers.getContractFactory("MockCoinbaseTrade");
        coinbaseTrade = await MockCoinbaseTrade.deploy();
        await coinbaseTrade.waitForDeployment();

        // Create escrow
        const tx = await factory.createEscrow(owner.address, INACTIVITY_PERIOD);
        const receipt = await tx.wait();

        // Get escrow address from event or from factory
        let escrowAddress;
        if (receipt.logs && receipt.logs.length > 0) {
            const event = receipt.logs.find((log) => {
                try {
                    const parsed = factory.interface.parseLog(log);
                    return parsed && parsed.name === "EscrowCreated";
                } catch {
                    return false;
                }
            });
            if (event) {
                const parsed = factory.interface.parseLog(event);
                escrowAddress = parsed.args[0];
            }
        }

        if (!escrowAddress) {
            const allEscrows = await factory.getAllEscrows();
            escrowAddress = allEscrows[0];
        }

        const Escrow = await ethers.getContractFactory("HeiraInheritanceEscrow");
        escrow = Escrow.attach(escrowAddress);
    });

    describe("Deployment", function () {
        it("Should set the correct main wallet", async function () {
            expect(await escrow.mainWallet()).to.equal(owner.address);
        });

        it("Should set the correct inactivity period", async function () {
            expect(await escrow.inactivityPeriod()).to.equal(INACTIVITY_PERIOD);
        });

        it("Should set status to Active", async function () {
            expect(await escrow.status()).to.equal(0); // Status.Active = 0
        });

        it("Should set owner correctly", async function () {
            expect(await escrow.owner()).to.equal(owner.address);
        });
    });

    describe("Beneficiary Management", function () {
        it("Should add a beneficiary", async function () {
            const chainId = (await ethers.provider.getNetwork()).chainId;
            await escrow.addBeneficiary(beneficiary1.address, 5000, chainId);
            const beneficiaries = await escrow.getBeneficiaries();
            expect(beneficiaries.length).to.equal(1);
            expect(beneficiaries[0].recipient).to.equal(beneficiary1.address);
            expect(beneficiaries[0].percentage).to.equal(5000);
        });

        it("Should reject invalid percentage", async function () {
            const chainId = (await ethers.provider.getNetwork()).chainId;
            await expect(
                escrow.addBeneficiary(beneficiary1.address, BASIS_POINTS + 1, chainId)
            ).to.be.revertedWith("Invalid percentage");
        });

        it("Should reject zero address beneficiary", async function () {
            const chainId = (await ethers.provider.getNetwork()).chainId;
            await expect(
                escrow.addBeneficiary(ethers.ZeroAddress, 5000, chainId)
            ).to.be.revertedWith("Invalid recipient");
        });

        it("Should allow multiple beneficiaries", async function () {
            const chainId = (await ethers.provider.getNetwork()).chainId;
            await escrow.addBeneficiary(beneficiary1.address, 3000, chainId);
            await escrow.addBeneficiary(beneficiary2.address, 7000, chainId);
            const beneficiaries = await escrow.getBeneficiaries();
            expect(beneficiaries.length).to.equal(2);
        });
    });

    describe("Token Configuration", function () {
        it("Should add token configuration", async function () {
            const chainId = (await ethers.provider.getNetwork()).chainId;
            await escrow.addTokenConfig(mockToken.target, chainId, false, ethers.ZeroAddress);
            const configs = await escrow.getTokenConfigs();
            expect(configs.length).to.equal(1);
            expect(configs[0].tokenAddress).to.equal(mockToken.target);
        });

        it("Should require target token if swap is enabled", async function () {
            const chainId = (await ethers.provider.getNetwork()).chainId;
            await expect(
                escrow.addTokenConfig(mockToken.target, chainId, true, ethers.ZeroAddress)
            ).to.be.revertedWith("Invalid target token");
        });
    });

    describe("Status Management", function () {
        it("Should allow owner to deactivate", async function () {
            await escrow.deactivate();
            expect(await escrow.status()).to.equal(1); // Status.Inactive = 1
        });

        it("Should prevent non-owner from deactivating", async function () {
            await expect(escrow.connect(beneficiary1).deactivate()).to.be.reverted;
        });

        it("Should return correct status", async function () {
            expect(await escrow.getStatus()).to.equal(0); // Active
            await escrow.deactivate();
            expect(await escrow.getStatus()).to.equal(1); // Inactive
        });
    });

    describe("Activity Tracking", function () {
        it("Should update activity timestamp", async function () {
            const currentTimestamp = await escrow.lastActivityTimestamp();
            // Use block.timestamp to ensure it's not in the future
            const blockTimestamp = await time.latest();
            const newTimestamp = Math.max(Number(currentTimestamp) + 1, blockTimestamp);
            await escrow.updateActivity(newTimestamp);
            expect(await escrow.lastActivityTimestamp()).to.equal(BigInt(newTimestamp));
        });

        it("Should reject older timestamps", async function () {
            const currentTimestamp = await escrow.lastActivityTimestamp();
            await expect(escrow.updateActivity(currentTimestamp - BigInt(1000))).to.be.revertedWith(
                "Timestamp must be newer"
            );
        });
    });

    describe("Execution Conditions", function () {
        it("Should not execute before inactivity period", async function () {
            const chainId = (await ethers.provider.getNetwork()).chainId;
            await escrow.addBeneficiary(beneficiary1.address, BASIS_POINTS, chainId);
            await escrow.addTokenConfig(mockToken.target, chainId, false, ethers.ZeroAddress);

            expect(await escrow.canExecute()).to.be.false;
            await expect(escrow.run()).to.be.revertedWith("Execution conditions not met");
        });

        it("Should execute after inactivity period", async function () {
            const chainId = (await ethers.provider.getNetwork()).chainId;
            await escrow.addBeneficiary(beneficiary1.address, BASIS_POINTS, chainId);
            await escrow.addTokenConfig(mockToken.target, chainId, false, ethers.ZeroAddress);

            // Transfer tokens to escrow
            await mockToken.transfer(escrow.target, ethers.parseEther("1000"));

            // Fast forward time
            await time.increase(INACTIVITY_PERIOD + 1);

            expect(await escrow.canExecute()).to.be.true;

            const initialBalance = await mockToken.balanceOf(beneficiary1.address);
            await escrow.run();
            const finalBalance = await mockToken.balanceOf(beneficiary1.address);

            expect(finalBalance - initialBalance).to.equal(ethers.parseEther("1000"));
        });

        it("Should not execute if contract is inactive", async function () {
            const chainId = (await ethers.provider.getNetwork()).chainId;
            await escrow.addBeneficiary(beneficiary1.address, BASIS_POINTS, chainId);
            await escrow.addTokenConfig(mockToken.target, chainId, false, ethers.ZeroAddress);
            await escrow.deactivate();

            await time.increase(INACTIVITY_PERIOD + 1);

            await expect(escrow.run()).to.be.revertedWith("Contract is inactive");
        });
    });

    describe("Distribution", function () {
        it("Should distribute funds according to percentages", async function () {
            const chainId = (await ethers.provider.getNetwork()).chainId;
            await escrow.addBeneficiary(beneficiary1.address, 3000, chainId); // 30%
            await escrow.addBeneficiary(beneficiary2.address, 7000, chainId); // 70%
            await escrow.addTokenConfig(mockToken.target, chainId, false, ethers.ZeroAddress);

            const amount = ethers.parseEther("1000");
            await mockToken.transfer(escrow.target, amount);

            await time.increase(INACTIVITY_PERIOD + 1);

            const balance1Before = await mockToken.balanceOf(beneficiary1.address);
            const balance2Before = await mockToken.balanceOf(beneficiary2.address);

            await escrow.run();

            const balance1After = await mockToken.balanceOf(beneficiary1.address);
            const balance2After = await mockToken.balanceOf(beneficiary2.address);

            expect(balance1After - balance1Before).to.equal(ethers.parseEther("300"));
            expect(balance2After - balance2Before).to.equal(ethers.parseEther("700"));
        });
    });

    describe("Time Calculations", function () {
        it("Should calculate time until execution correctly", async function () {
            const timeUntil = await escrow.getTimeUntilExecution();
            expect(timeUntil).to.be.closeTo(INACTIVITY_PERIOD, 5); // Allow 5 second variance
        });

        it("Should return 0 when ready to execute", async function () {
            await time.increase(INACTIVITY_PERIOD + 1);
            const timeUntil = await escrow.getTimeUntilExecution();
            expect(timeUntil).to.equal(0);
        });
    });
});

describe("HeiraInheritanceEscrowFactory", function () {
    let factory;
    let owner;

    beforeEach(async function () {
        [owner] = await ethers.getSigners();
        const Factory = await ethers.getContractFactory("HeiraInheritanceEscrowFactory");
        factory = await Factory.deploy();
        await factory.waitForDeployment();
    });

    it("Should create a new escrow", async function () {
        const inactivityPeriod = 90 * 24 * 60 * 60;
        const tx = await factory.createEscrow(owner.address, inactivityPeriod);
        await expect(tx).to.emit(factory, "EscrowCreated");

        const escrows = await factory.getAllEscrows();
        expect(escrows.length).to.equal(1);
        expect(await factory.isEscrow(escrows[0])).to.be.true;
    });

    it("Should track escrows by owner", async function () {
        const inactivityPeriod = 90 * 24 * 60 * 60;
        await factory.createEscrow(owner.address, inactivityPeriod);

        const ownerEscrows = await factory.getEscrowsByOwner(owner.address);
        expect(ownerEscrows.length).to.equal(1);
    });

    it("Should return correct escrow count", async function () {
        const inactivityPeriod = 90 * 24 * 60 * 60;
        await factory.createEscrow(owner.address, inactivityPeriod);
        await factory.createEscrow(owner.address, inactivityPeriod);

        expect(await factory.getEscrowCount()).to.equal(2);
    });
});
