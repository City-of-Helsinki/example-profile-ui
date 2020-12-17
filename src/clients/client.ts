/* eslint-disable react-hooks/rules-of-hooks */
import React, {
  useEffect,
  useState,
  useRef,
  useCallback,
  createContext
} from 'react';
import {
  Client,
  ClientErrorObject,
  ClientEvent,
  ClientStatus,
  ClientStatusId,
  ClientError,
  ClientType,
  FetchApiTokenOptions,
  FetchError,
  getClientConfig,
  JWTPayload
} from '.';
import { getClient as getKeycloakClient } from './keycloak';
import { getClient as getOidcClient } from './oidc-react';

export function getClient(clientType?: ClientType): Client {
  const type = clientType || getClientConfig().type;
  return type === 'keycloak' ? getKeycloakClient() : getOidcClient();
}

export function useClient(clientType?: ClientType): Client {
  const clientRef: React.Ref<Client> = useRef(getClient(clientType));
  const clientFromRef: Client = clientRef.current as Client;
  const [, setStatus] = useState<ClientStatusId>(clientFromRef.getStatus());
  useEffect(() => {
    const initClient = async (): Promise<void> => {
      if (!clientFromRef.isInitialized()) {
        await clientFromRef.getOrLoadUser().catch(e => {
          clientFromRef.setError({
            type: ClientError.INIT_ERROR,
            message: e && e.toString()
          });
        });
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
}

export function useKeycloak(): Client {
  return useClient('keycloak');
}

export function useOidc(): Client {
  return useClient('oidc');
}

export function useClientErrorDetection(
  clientType?: ClientType
): ClientErrorObject {
  const clientRef: React.Ref<Client> = useRef(getClient(clientType));
  const clientFromRef: Client = clientRef.current as Client;
  const [error, setError] = useState<ClientErrorObject>(undefined);
  useEffect(() => {
    let isAuthorized = false;
    const statusListenerDisposer = clientFromRef.addListener(
      ClientEvent.STATUS_CHANGE,
      status => {
        if (status === ClientStatus.AUTHORIZED) {
          isAuthorized = true;
        }
        if (isAuthorized && status === ClientStatus.UNAUTHORIZED) {
          setError({ type: ClientError.UNEXPECTED_AUTH_CHANGE, message: '' });
          isAuthorized = false;
        }
      }
    );

    const errorListenerDisposer = clientFromRef.addListener(
      ClientEvent.ERROR,
      newError => {
        setError(newError as ClientErrorObject);
      }
    );
    const logoutListenerDisposer = clientFromRef.addListener(
      ClientEvent.LOGGING_OUT,
      (): void => {
        isAuthorized = false;
      }
    );

    return (): void => {
      errorListenerDisposer();
      statusListenerDisposer();
      logoutListenerDisposer();
    };
  }, [clientFromRef]);
  return error;
}

export function useKeycloakErrorDetection(): ClientErrorObject {
  return useClientErrorDetection('keycloak');
}

export function useOidcErrorDetection(): ClientErrorObject {
  return useClientErrorDetection('oidc');
}

export function useClientCallback(clientType?: ClientType): Client {
  const clientRef: React.Ref<Client> = useRef(getClient(clientType));
  const clientFromRef: Client = clientRef.current as Client;
  const [, setStatus] = useState<ClientStatusId>(clientFromRef.getStatus());
  useEffect(() => {
    const initClient = async (): Promise<void> => {
      if (clientFromRef.isInitialized()) {
        throw new Error(
          'Client already initialized. This should not happen with callback. When using callback, client should not be initialized more than once.'
        );
      }
      await clientFromRef.handleCallback().catch(e =>
        clientFromRef.setError({
          type: ClientError.INIT_ERROR,
          message: e && e.toString()
        })
      );
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
}

export type FetchStatus =
  | 'unauthorized'
  | 'ready'
  | 'loading'
  | 'error'
  | 'loaded'
  | 'waiting';

export type ApiAccessTokenActions = {
  fetch: (options: FetchApiTokenOptions) => Promise<JWTPayload | FetchError>;
  getStatus: () => FetchStatus;
  getTokens: () => JWTPayload | undefined;
};

export const ApiAccessTokenActionsContext = createContext<ApiAccessTokenActions | null>(
  null
);

export function useApiAccessTokens(): ApiAccessTokenActions {
  const client = useClient();
  const tokens = client.isAuthenticated() ? client.getApiTokens() : undefined;
  const hasTokens = tokens && Object.keys(tokens).length;
  const [apiTokens, setApiTokens] = useState<JWTPayload | undefined>(
    hasTokens ? tokens : undefined
  );

  const resolveStatus = (): FetchStatus => {
    if (!client.isAuthenticated()) {
      return 'unauthorized';
    }
    if (apiTokens) {
      return 'loaded';
    }
    return 'ready';
  };

  const resolveCurrentStatus = (
    baseStatus: FetchStatus,
    stateStatus: FetchStatus
  ): FetchStatus => {
    if (stateStatus === 'unauthorized' || baseStatus === 'unauthorized') {
      return baseStatus;
    }
    return stateStatus;
  };

  const resolvedStatus = resolveStatus();
  const [status, setStatus] = useState<FetchStatus>(resolvedStatus);
  const currentStatus = resolveCurrentStatus(resolvedStatus, status);
  if (resolvedStatus === 'unauthorized' && apiTokens) {
    setApiTokens(undefined);
    setStatus('unauthorized');
  }

  const fetchTokens: ApiAccessTokenActions['fetch'] = useCallback(
    async options => {
      setStatus('loading');
      const result = await client.getApiAccessToken(options);
      if (result.error) {
        setStatus('error');
      } else {
        setApiTokens(result as JWTPayload);
        setStatus('loaded');
      }
      return result;
    },
    [client]
  );

  useEffect(() => {
    const autoFetch = async (): Promise<void> => {
      if (currentStatus !== 'ready') {
        return;
      }
      fetchTokens({
        audience: String(process.env.REACT_APP_API_BACKEND_AUDIENCE),
        permission: String(process.env.REACT_APP_API_BACKEND_PERMISSION),
        grantType: String(process.env.REACT_APP_API_BACKEND_GRANT_TYPE)
      });
    };

    autoFetch();
  }, [fetchTokens, currentStatus]);

  return {
    getStatus: () => status,
    fetch: options => fetchTokens(options),
    getTokens: () => apiTokens
  } as ApiAccessTokenActions;
}
