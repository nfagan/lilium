export class Result<T, E> {
  private data: T | E;
  private isError: boolean;

  private constructor(data: T | E, isError: boolean) {
    this.data = data;
    this.isError = isError;
  }

  isOk(): boolean {
    return !this.isError;
  }

  isErr(): boolean {
    return this.isError;
  }

  unwrapErr(): E {
    if (!this.isError) {
      throw new Error('Attempt to unwrapErr on an ok-value.');
    }

    return this.data as E;
  }

  unwrap(): T {
    if (this.isError) {
      throw new Error('Attempt to unwrap an error value.');
    }

    return this.data as T;
  }

  static Err<T, E>(err: E): Result<T, E> {
    return new Result<T, E>(err, true);
  }

  static Ok<T, E>(val: T): Result<T, E> {
    return new Result<T, E>(val, false);
  }
}