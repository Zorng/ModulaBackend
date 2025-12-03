// Shared ports/interfaces for cash module use cases

export interface IEventBus {
  publishViaOutbox(event: any, client?: any): Promise<void>;
}

export interface ITransactionManager {
  withTransaction<T>(fn: (client: any) => Promise<T>): Promise<T>;
}
