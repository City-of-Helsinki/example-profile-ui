import Adapter from 'enzyme-adapter-react-16';
import { configure } from 'enzyme';
// eslint-disable-next-line import/no-extraneous-dependencies
import { GlobalWithFetchMock } from 'jest-fetch-mock';
import { UserManager, UserManagerSettings } from 'oidc-client';
import {
  mockMutatorGetterOidc,
  mockOidcUserManager
} from './client/__mocks__/oidc-react-mock';
import { AnyFunction } from './common';

const customGlobal: GlobalWithFetchMock = global as GlobalWithFetchMock;
// eslint-disable-next-line import/no-extraneous-dependencies
customGlobal.fetch = require('jest-fetch-mock');

customGlobal.fetchMock = customGlobal.fetch;

configure({ adapter: new Adapter() });

jest.mock('react-router', () => ({
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore: expected ts type error
  ...jest.requireActual('react-router'),
  useHistory: (): Record<string, AnyFunction> => ({
    push: jest.fn()
  })
}));

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
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore: expected ts type error
    ...jest.requireActual('oidc-client'),
    UserManager: MockUserManagerClass
  };
});

jest.mock('./client/http-poller');
