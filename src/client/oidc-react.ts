import React, { useEffect, useState, useRef } from 'react';
import Oidc, {
  UserManager,
  UserManagerSettings,
  WebStorageStateStore,
  User
} from 'oidc-client';
import HttpStatusCode from 'http-status-typed';

import {
  Client,
  ClientStatus,
  ClientStatusId,
  User as ClientUser,
  ClientEvent,
  ClientError,
  createClient,
  ClientFactory,
  hasValidClientConfig,
  getClientConfig,
  getLocationBasedUri,
  getTokenUri,
  createClientGetOrLoadUserFunction,
  ClientConfig
} from './index';
import { AnyObject } from '../common';
import createHttpPoller from './http-poller';

let client: Client | null = null;

function oidcUserToClientUser(user: User): ClientUser {
  return (user as unknown) as ClientUser;
}

function bindEvents(
  manager: UserManager,
  eventFunctions: {
    onAuthChange: Client['onAuthChange'];
    setError: ClientFactory['setError'];
    eventTrigger: ClientFactory['eventTrigger'];
  }
): void {
  const { onAuthChange, setError, eventTrigger } = eventFunctions;
  manager.events.addUserLoaded((): void =>
    eventTrigger(ClientEvent.CLIENT_AUTH_SUCCESS)
  );
  manager.events.addUserUnloaded((): boolean => onAuthChange(false));
  manager.events.addUserSignedOut((): boolean => onAuthChange(false));
  manager.events.addUserSessionChanged((): boolean => onAuthChange(false));
  manager.events.addSilentRenewError((renewError?: Error): void => {
    const errorObj = renewError || undefined;
    const message = errorObj ? errorObj.message : '';
    setError({
      type: ClientError.AUTH_REFRESH_ERROR,
      message
    });
  });
  manager.events.addAccessTokenExpired((): void =>
    eventTrigger(ClientEvent.TOKEN_EXPIRED)
  );
  manager.events.addAccessTokenExpiring((): void =>
    eventTrigger(ClientEvent.TOKEN_EXPIRING)
  );
}

export function getSessionStorageKey(clientConfig?: ClientConfig): string {
  const config = clientConfig || getClientConfig();
  return `oidc.user:${config.authority}:${config.clientId}`;
}

export function createOidcClient(): Client {
  if (!hasValidClientConfig()) {
    const errorMessage = 'Invalid client config';
    // eslint-disable-next-line no-console
    console.error(errorMessage, getClientConfig());
    throw new Error(errorMessage);
  }
  const clientConfig = getClientConfig();
  const oidcConfig: UserManagerSettings = {
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
    authority: clientConfig.authority,
    automaticSilentRenew: clientConfig.automaticSilentRenew,
    client_id: clientConfig.clientId,
    redirect_uri: getLocationBasedUri(clientConfig.callbackPath),
    response_type: clientConfig.responseType,
    scope: clientConfig.scope,
    silent_redirect_uri: getLocationBasedUri(clientConfig.silentAuthPath),
    post_logout_redirect_uri: getLocationBasedUri(clientConfig.logoutPath)
  };
  const manager = new UserManager(oidcConfig);
  const {
    eventTrigger,
    getStoredUser,
    setStoredUser,
    fetchApiToken,
    ...clientFunctions
  } = createClient();

  const {
    isAuthenticated,
    isInitialized,
    setStatus,
    getStatus,
    setError
  } = clientFunctions;
  if (clientConfig.enableLogging) {
    Oidc.Log.logger = console;
    Oidc.Log.level = Oidc.Log.DEBUG;
  }

  const getSessionStorageData = (): AnyObject | undefined => {
    const userKey = getSessionStorageKey(clientConfig);
    const storedString = sessionStorage.getItem(userKey);
    if (
      !storedString ||
      storedString.length < 2 ||
      storedString.charAt(0) !== '{'
    ) {
      return undefined;
    }
    try {
      return JSON.parse(storedString);
    } catch (e) {
      return undefined;
    }
  };

  const getUserData = (): AnyObject | undefined =>
    getStoredUser() || getSessionStorageData() || undefined;

  const getUser: Client['getUser'] = () => {
    if (isAuthenticated()) {
      const user = (getUserData() as unknown) as User;
      const userData = user && user.profile;
      if (
        userData &&
        userData.name &&
        (userData.session_state || userData.amr)
      ) {
        return ({
          name: userData.name,
          given_name: userData.given_name,
          family_name: userData.family_name,
          email: userData.email
        } as unknown) as ClientUser;
      }
    }
    return undefined;
  };

  const onAuthChange = (authenticated: boolean): boolean => {
    if (isInitialized() && authenticated === isAuthenticated()) {
      return false;
    }
    const statusChanged = setStatus(
      authenticated ? ClientStatus.AUTHORIZED : ClientStatus.UNAUTHORIZED
    );
    if (statusChanged) {
      eventTrigger(getStatus(), getUser());
    }
    return true;
  };

  let initPromise: Promise<ClientUser | undefined> | undefined;
  const init: Client['init'] = () => {
    if (initPromise) {
      return initPromise;
    }
    const initializer = clientConfig.autoSignIn
      ? manager.signinSilent
      : manager.getUser;
    setStatus(ClientStatus.INITIALIZING);
    initPromise = new Promise((resolve, reject) => {
      initializer
        .call(manager)
        .then((loadedUser: User | null) => {
          if (loadedUser && loadedUser.expired === false) {
            const oidcUserAsClientUser = oidcUserToClientUser(loadedUser);
            setStoredUser(oidcUserAsClientUser);
            onAuthChange(true);
            resolve(oidcUserAsClientUser);
            return;
          }
          onAuthChange(false);
          resolve(undefined);
        })
        .catch((errorData?: Error) => {
          const reason = errorData ? errorData.message : '';
          onAuthChange(false);
          if (reason !== 'login_required') {
            setError({
              type: ClientError.AUTH_ERROR,
              message: reason
            });
            reject(errorData);
            return;
          }
          resolve(undefined);
        });
    });
    return initPromise;
  };

  const getOrLoadUser = createClientGetOrLoadUserFunction({
    getUser,
    isInitialized,
    init
  });

  const login: Client['login'] = () => {
    manager.signinRedirect();
  };

  const logout: Client['logout'] = () => {
    eventTrigger(ClientEvent.LOGGING_OUT);
    setStoredUser(undefined);
    manager.signoutRedirect();
  };

  const clearSession: Client['clearSession'] = () => false;

  const handleCallback: Client['handleCallback'] = () => {
    if (initPromise) {
      return initPromise;
    }
    initPromise = new Promise((resolve, reject) => {
      setStatus(ClientStatus.INITIALIZING);
      manager
        .signinRedirectCallback()
        .then((loadedUser: User | undefined) => {
          const oidcUserAsClientUser = loadedUser
            ? oidcUserToClientUser(loadedUser)
            : undefined;
          setStoredUser(oidcUserAsClientUser);
          onAuthChange(true);
          resolve(oidcUserAsClientUser);
        })
        .catch(e => {
          setError({
            type: ClientError.AUTH_ERROR,
            message: e && e.toString()
          });
          onAuthChange(false);
          reject(e);
        });
    });
    return initPromise;
  };

  const loadUserProfile: Client['loadUserProfile'] = () =>
    new Promise((resolve, reject) => {
      manager
        .getUser()
        .then(loadedUser => {
          const oidcUserAsClientUser = loadedUser
            ? oidcUserToClientUser(loadedUser)
            : undefined;
          setStoredUser(oidcUserAsClientUser);
          resolve(oidcUserAsClientUser as ClientUser);
        })
        .catch(e => {
          setStoredUser(undefined);
          setError({
            type: ClientError.LOAD_ERROR,
            message: e && e.toString()
          });
          reject(e);
        });
    });

  const getUserProfile: Client['getUserProfile'] = () => getStoredUser();

  const getApiAccessToken: Client['getApiAccessToken'] = async options => {
    const user = getStoredUser();
    if (!user) {
      throw new Error('getApiAccessToken: no user with access token');
    }
    return fetchApiToken({
      uri: getTokenUri(getClientConfig()),
      accessToken: user.access_token as string,
      ...options
    });
  };

  const getUserTokens: Client['getUserTokens'] = () => {
    if (!isAuthenticated()) {
      return undefined;
    }
    const user = getStoredUser() as Record<string, string | undefined>;
    return {
      accessToken: user.access_token,
      idToken: user.id_token,
      refreshToken: user.refresh_token
    };
  };

  client = {
    init,
    login,
    logout,
    loadUserProfile,
    getUserProfile,
    getUser,
    clearSession,
    handleCallback,
    getOrLoadUser,
    onAuthChange,
    getApiAccessToken,
    getUserTokens,
    ...clientFunctions
  };
  bindEvents(manager, { onAuthChange, eventTrigger, setError });

  const userInfoFetchFunction = async (): Promise<Response | undefined> => {
    const uri = await manager.metadataService.getUserInfoEndpoint();
    const tokens = getUserTokens();
    const accessToken = tokens && tokens.accessToken;
    if (!accessToken) {
      return Promise.reject(new Error('Access token not set'));
    }
    const headers = new Headers();
    headers.append('Authorization', `Bearer ${accessToken}`);

    return fetch(uri, {
      method: 'GET',
      headers
    });
  };

  const userSessionValidityPoller = createHttpPoller({
    pollFunction: userInfoFetchFunction,
    shouldPoll: () => isAuthenticated(),
    onError: returnedHttpStatus => {
      if (
        isAuthenticated() &&
        returnedHttpStatus &&
        (returnedHttpStatus === HttpStatusCode.FORBIDDEN ||
          returnedHttpStatus === HttpStatusCode.UNAUTHORIZED)
      ) {
        setError({ type: ClientError.UNEXPECTED_AUTH_CHANGE, message: '' });
        return { keepPolling: false };
      }
      return { keepPolling: isAuthenticated() };
    }
  });
  clientFunctions.addListener(ClientEvent.AUTHORIZED, () => {
    userSessionValidityPoller.start();
  });
  clientFunctions.addListener(ClientEvent.UNAUTHORIZED, () => {
    userSessionValidityPoller.stop();
  });
  return client;
}

export function getClient(): Client {
  if (client) {
    return client;
  }
  client = createOidcClient();
  return client;
}

export const useOidcCallback = (): Client => {
  const clientRef: React.Ref<Client> = useRef(getClient());
  const clientFromRef: Client = clientRef.current as Client;
  const [, setStatus] = useState<ClientStatusId>(clientFromRef.getStatus());
  useEffect(() => {
    const initClient = async (): Promise<void> => {
      if (!clientFromRef.isInitialized()) {
        await clientFromRef.handleCallback().catch(e =>
          clientFromRef.setError({
            type: ClientError.INIT_ERROR,
            message: e && e.toString()
          })
        );
      }
    };
    const statusListenerDisposer = clientFromRef.addListener(
      ClientEvent.STATUS_CHANGE,
      status => {
        setStatus(status as ClientStatusId);
      }
    );

    initClient();
    return (): void => {
      statusListenerDisposer();
    };
  }, [clientFromRef]);
  return clientFromRef;
};
