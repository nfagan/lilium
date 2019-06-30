import * as types from '.';

export function tryExtractErrorMessage(err: any, orElse: string = ''): string {
  return (types.isBasicErr(err) ? err.message : orElse);
}