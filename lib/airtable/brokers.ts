import { brokersTable } from './client';
import type { Broker } from '@/lib/types';
import bcrypt from 'bcryptjs';

/**
 * Get all brokers (without passwords)
 */
export async function getBrokers(): Promise<Broker[]> {
  try {
    const records = await brokersTable
      .select({
        sort: [{ field: 'broker', direction: 'asc' }],
      })
      .all();

    return records.map((record) => ({
      id: record.id,
      fields: {
        broker: record.get('broker') as string,
        password: '***', // Don't expose passwords
        'Date de création': record.get('Date de création') as string,
      },
      createdTime: record.get('_createdTime') as string || new Date().toISOString(),
    }));
  } catch (error) {
    console.error('Error fetching brokers:', error);
    throw new Error('Failed to fetch brokers');
  }
}

/**
 * Authenticate a broker
 */
export async function authenticateBroker(
  username: string,
  password: string
): Promise<Broker | null> {
  try {
    const records = await brokersTable
      .select({
        filterByFormula: `{broker} = '${username}'`,
        maxRecords: 1,
      })
      .all();

    if (records.length === 0) {
      return null;
    }

    const record = records[0];
    const storedPassword = record.get('password') as string;

    // Direct password comparison for now
    // TODO: Implement bcrypt hashing for passwords in Airtable
    if (storedPassword === password) {
      return {
        id: record.id,
        fields: {
          broker: record.get('broker') as string,
          password: '***', // Don't expose password
          'Date de création': record.get('Date de création') as string,
        },
        createdTime: record.get('_createdTime') as string || new Date().toISOString(),
      };
    }

    return null;
  } catch (error) {
    console.error('Error authenticating broker:', error);
    return null;
  }
}

/**
 * Get a broker by username
 */
export async function getBrokerByUsername(username: string): Promise<Broker | null> {
  try {
    const records = await brokersTable
      .select({
        filterByFormula: `{broker} = '${username}'`,
        maxRecords: 1,
      })
      .all();

    if (records.length === 0) {
      return null;
    }

    const record = records[0];

    return {
      id: record.id,
      fields: {
        broker: record.get('broker') as string,
        password: '***', // Don't expose password
        'Date de création': record.get('Date de création') as string,
      },
      createdTime: record.get('_createdTime') as string || new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error fetching broker:', error);
    return null;
  }
}

/**
 * Create a new broker
 */
export async function createBroker(
  username: string,
  password: string
): Promise<Broker> {
  try {
    // Hash password before storing
    // const hashedPassword = await bcrypt.hash(password, 10);

    const record = await brokersTable.create({
      broker: username,
      password: password, // Store plain text for now, implement hashing later
    });

    return {
      id: record.id,
      fields: {
        broker: record.get('broker') as string,
        password: '***',
        'Date de création': record.get('Date de création') as string,
      },
      createdTime: record.get('_createdTime') as string || new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error creating broker:', error);
    throw new Error('Failed to create broker');
  }
}
