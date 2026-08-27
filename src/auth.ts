// Wires the auth event emitter returned by init() — the PARENT-window auth stream
// (SDK_SUCCESS / SUCCESS / FAILURE / LOGOUT), distinct from the iframe events.
import { setDot } from './dom';
import { log } from './log';
import { getSDK } from './sdk';
import { SSO_ATTEMPTS } from './store';
import type { AuthEventEmitter } from './types';

export function wireAuth(authEE: AuthEventEmitter): void {
  const S = getSDK()!.AuthStatus;
  authEE
    .on(S.SDK_SUCCESS, () => {
      setDot('ok');
      log('ok', 'SDK_SUCCESS', 'auth passed in parent window; iframe not loaded yet');
    })
    .on(S.SUCCESS, (info: any) => {
      sessionStorage.removeItem(SSO_ATTEMPTS);
      setDot('ok');
      log('ok', 'SUCCESS', info && (info.userGUID || info.userName) ? `user=${info.userName || info.userGUID}` : 'session active');
    })
    .on(S.FAILURE, (type: unknown) => {
      setDot('err');
      log('err', 'FAILURE', `type=${type}`);
    })
    .on(S.LOGOUT, () => {
      setDot('');
      log('warn', 'LOGOUT', '');
    })
    .on(S.WAITING_FOR_POPUP, () => log('info', 'WAITING_FOR_POPUP', 'SSO popup pending'));
}
