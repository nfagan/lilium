import * as types from '.';

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