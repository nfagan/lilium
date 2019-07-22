import * as types from './types';

export class ObjectToggle<U, T extends {[k: string]: U}> {
  private keys: Array<keyof T>;
  private index: number;
  private value: T;

  constructor(v: T) {
    this.value = v;
    this.keys = Object.keys(v);
    this.index = 0;
  }

  randomize(): void {
    this.index = Math.max(Math.min(Math.floor(Math.random() * this.keys.length), this.keys.length-1), 0);
  }

  cycle(): void {
    this.index++;
    if (this.index >= this.keys.length) {
      this.index = 0;
    }
  }

  current(): U {
    if (this.keys.length === 0) {
      return null;
    } else {
      return this.value[this.keys[this.index]];
    }
  }
}

export function tryExtractErrorMessage(err: any, orElse: string = ''): string {
  return (types.isBasicErr(err) ? err.message : orElse);
}

export function asyncTimeout<T>(func: () => Promise<T>, milliseconds: number): Promise<T> {
  return new Promise((resolve, reject) => {
    let responded = false;

    func().then(v => {
      if (!responded) {
        responded = true;
        resolve(v);
      }
    }).catch(err => {
      if (!responded)  {
        responded = true;
        reject(err);
      }
    });

    setTimeout(() => {
      if (!responded) {
        responded = true;
        reject(new Error(`Failed to resolve promise in ${milliseconds} ms.`));
      }
    }, milliseconds);
  });
}