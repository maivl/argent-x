import Dexie, { Table } from "dexie"
import { GenerateKeyPairResult } from "jose"

/** TODO: align approach - originally copied from packages/web */

export interface Device {
  id?: number
  signingKey: GenerateKeyPairResult | string
  /** presence of email indicates that the email has been verified by 2fa with backend */
  verifiedEmail?: string
  /** ISO date string of when the email was updated */
  verifiedAt?: string
}

export class StoreDexie extends Dexie {
  devices!: Table<Device>

  constructor() {
    super("store")
    this.version(1).stores({
      devices: "id, signingKey, verifiedEmail, verifiedAt",
    })
  }
}

export const idb = new StoreDexie()
