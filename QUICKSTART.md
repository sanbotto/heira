# Quick Start Guide

## Get Started in 5 Minutes

### 1. Install Dependencies

```bash
# Smart Contracts
cd contracts
npm install

# Frontend
cd ../app
npm install
```

### 2. Configure Environment

**Contracts:**
```bash
cd contracts
cp .env.example .env
# Edit .env with your test wallet private key
```

**App:**
```bash
cd app
cp .env.example .env
# Edit .env with your API keys and factory addresses
```

### 3. Test Smart Contracts

```bash
cd contracts
npm test
```

### 4. Deploy to Testnet

```bash
# Deploy to Sepolia
npx hardhat run scripts/deploy.js --network sepolia

# Copy the factory address and add to app/.env:
# VITE_FACTORY_ADDRESS_ETHEREUM=0x...
```

### 5. Run Frontend

```bash
cd app
npm run dev
```

Open `http://localhost:5173` in your browser and connect your wallet!

## More Details

For deployment instructions, see the [README.md](./README.md) file.
