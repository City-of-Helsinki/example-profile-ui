import Adapter from 'enzyme-adapter-react-16';
import { configure } from 'enzyme';
import Keycloak from 'keycloak-js';
// eslint-disable-next-line import/no-extraneous-dependencies
import { GlobalWithFetchMock } from 'jest-fetch-mock';
import { UserManager, UserManagerSettings } from 'oidc-client';
import {
  mockMutatorGetter,
  mockKeycloak
} from './clients/__mocks__/keycloak-mock';
import {
  mockMutatorGetterOidc,
  mockOidcUserManager
} from './clients/__mocks__/oidc-react-mock';
import { AnyObject, AnyFunction } from './common';

const customGlobal: GlobalWithFetchMock = global as GlobalWithFetchMock;
// eslint-disable-next-line import/no-extraneous-dependencies
customGlobal.fetch = require('jest-fetch-mock');

customGlobal.fetchMock = customGlobal.fetch;

configure({ adapter: new Adapter() });

jest.mock('react-router', () => ({
  ...(jest.requireActual('react-router') as AnyObject),
  useHistory: (): Record<string, AnyFunction> => ({
    push: jest.fn()
  })
}));

jest.mock('keycloak-js', () => (): Keycloak.KeycloakInstance => {
  const mockMutator = mockMutatorGetter();
  const clientInstance = mockKeycloak(
    jest.requireActual('keycloak-js')() as Keycloak.KeycloakInstance,
    mockMutator
  );
  mockMutator.setInstance(clientInstance);
  return clientInstance;
});

jest.mock('oidc-client', () => {
  class MockUserManagerClass {
    constructor(settings: UserManagerSettings) {
      const mockMutator = mockMutatorGetterOidc();
      const userManager = mockOidcUserManager(settings) as UserManager;
      mockMutator.setInstance(userManager);
      return userManager;
    }
  }
  return {
    ...(jest.requireActual('oidc-client') as AnyObject),
    UserManager: MockUserManagerClass
  };
});
