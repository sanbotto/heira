import { type Address } from 'viem';
import { mainnet } from 'viem/chains';
import { getPublicClient } from './wallet';

/**
 * Resolve ENS name to address
 */
export async function resolveEnsName(name: string): Promise<Address | null> {
  try {
    const client = getPublicClient(mainnet.id);
    const address = await client.getEnsAddress({ name });
    return address;
  } catch (error) {
    console.error('Failed to resolve ENS name:', error);
    return null;
  }
}

/**
 * Get ENS name for an address
 */
export async function getEnsName(address: Address): Promise<string | null> {
  try {
    const client = getPublicClient(mainnet.id);
    const name = await client.getEnsName({ address });
    return name;
  } catch (error) {
    console.error('Failed to get ENS name:', error);
    return null;
  }
}

/**
 * Get ENS avatar URL
 */
export async function getEnsAvatar(address: Address): Promise<string | null> {
  try {
    const client = getPublicClient(mainnet.id);
    const avatar = await client.getEnsAvatar({ name: address });
    return avatar;
  } catch (error) {
    console.error('Failed to get ENS avatar:', error);
    return null;
  }
}

/**
 * Get ENS avatar by ENS name
 */
export async function getEnsAvatarByName(name: string): Promise<string | null> {
  try {
    const client = getPublicClient(mainnet.id);
    const avatar = await client.getEnsAvatar({ name });
    return avatar;
  } catch (error) {
    console.error('Failed to get ENS avatar:', error);
    return null;
  }
}
