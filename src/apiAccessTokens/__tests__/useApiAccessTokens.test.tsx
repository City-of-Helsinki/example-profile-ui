import React from 'react';
import { mount, ReactWrapper } from 'enzyme';
import { act } from 'react-dom/test-utils';
import { waitFor } from '@testing-library/react';
import { FetchMock } from 'jest-fetch-mock';
import { configureClient } from '../../client/__mocks__/index';
import { getClient } from '../../client/oidc-react';
import { mockMutatorGetterOidc } from '../../client/__mocks__/oidc-react-mock';
import {
  setUpUser,
  mockApiTokenResponse,
  logoutUser,
  clearApiTokens,
  createApiTokenFetchPayload,
  setEnv
} from '../../client/__tests__/common';
import { AnyFunction, AnyObject } from '../../common';
import {
  useApiAccessTokens,
  ApiAccessTokenActions,
  FetchStatus
} from '../useApiAccessTokens';

describe('useApiAccessTokens hook ', () => {
  configureClient({ tokenExchangePath: '/token-exchange/' });
  const fetchMock: FetchMock = global.fetch;
  const mockMutator = mockMutatorGetterOidc();
  const client = getClient();
  const testAudience = 'test-audience';
  let apiTokenActions: ApiAccessTokenActions;
  let dom: ReactWrapper;
  let restoreEnv: AnyFunction;

  const HookTester = (): React.ReactElement => {
    apiTokenActions = useApiAccessTokens();
    return <div id="api-token-status">{apiTokenActions.getStatus()}</div>;
  };

  const setUser = async (user: AnyObject): Promise<void> =>
    setUpUser(user, mockMutator, client);

  const setUpTest = async (props?: {
    user?: AnyObject;
    apiToken?: string;
  }): Promise<void> => {
    const { user } = props || {};
    if (user) {
      await setUser(user);
    }
    dom = mount(<HookTester />);
  };

  beforeAll(async () => {
    restoreEnv = setEnv({
      REACT_APP_PROFILE_AUDIENCE: testAudience
    });
    fetchMock.enableMocks();
    await client.init();
  });
  afterAll(() => {
    restoreEnv();
    fetchMock.disableMocks();
  });
  afterEach(() => {
    fetchMock.resetMocks();
    mockMutator.resetMock();
  });
  beforeEach(() => {
    if (dom) {
      dom.unmount();
    }
    logoutUser(client);
    clearApiTokens(client);
  });

  const getApiTokenStatus = (): FetchStatus | undefined => {
    const text = dom
      .find('#api-token-status')
      .at(0)
      .text();
    return text ? (text as FetchStatus) : undefined;
  };

  it('status depends on client and changes with it', async () => {
    await act(async () => {
      await setUpTest();
      await waitFor(() => expect(getApiTokenStatus()).toBe('unauthorized'));
      expect(apiTokenActions.getTokens()).toBeUndefined();
      expect(apiTokenActions.getStatus() === 'unauthorized');
      const tokens = mockApiTokenResponse({ delay: 100 });
      await setUser({});
      await waitFor(() => expect(getApiTokenStatus()).toBe('loading'));
      await waitFor(() => expect(getApiTokenStatus()).toBe('loaded'));
      expect(apiTokenActions.getTokens()).toEqual(tokens);
      logoutUser(client);
      await waitFor(() => expect(getApiTokenStatus()).toBe('unauthorized'));
      expect(apiTokenActions.getTokens()).toBeUndefined();
    });
  });

  it('can be controlled with actions', async () => {
    await act(async () => {
      await setUpTest();
      await waitFor(() => expect(getApiTokenStatus()).toBe('unauthorized'));
      expect(apiTokenActions.getTokens()).toBeUndefined();
      expect(apiTokenActions.getStatus() === 'unauthorized');
      mockApiTokenResponse({ returnError: true });
      await setUser({});
      await waitFor(() => expect(getApiTokenStatus()).toBe('error'));
      expect(apiTokenActions.getTokens()).toBeUndefined();
      const tokens = mockApiTokenResponse();
      apiTokenActions.fetch(createApiTokenFetchPayload());
      await waitFor(() => expect(getApiTokenStatus()).toBe('loaded'));
      expect(apiTokenActions.getTokens()).toEqual(tokens);
    });
  });

  it('api token is auto fetched when user is authorized', async () => {
    await act(async () => {
      await setUpTest({
        user: {}
      });
      const tokens = mockApiTokenResponse({ delay: 100 });
      await waitFor(() => expect(getApiTokenStatus()).toBe('loading'));
      await waitFor(() => expect(getApiTokenStatus()).toBe('loaded'));
      expect(apiTokenActions.getTokens()).toEqual(tokens);
    });
  });
  it('api tokens are cleared when user logs out', async () => {
    await act(async () => {
      await setUpTest({
        user: {}
      });
      mockApiTokenResponse({ delay: 100 });
      await waitFor(() => expect(getApiTokenStatus()).toBe('loaded'));
      logoutUser(client);
      await waitFor(() => expect(getApiTokenStatus()).toBe('unauthorized'));
    });
  });
});
