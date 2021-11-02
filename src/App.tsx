import React from 'react';
import { Switch, Route } from 'react-router';

import { ClientProvider } from './client/ClientProvider';
import StoreProvider from './client/redux/StoreProvider';
import PageContainer from './components/PageContainer';
import HandleCallback from './components/HandleCallback';
import ConfigChecker from './components/ConfigChecker';
import config from './config';
import Index from './pages/Index';
import Tokens from './pages/Tokens';
import Header from './components/Header';
import PlainSuomiFiUserInfo from './pages/PlainSuomiFiUserInfo';
import ApiAccessTokens from './pages/ApiAccessTokens';
import ProfilePage from './pages/ProfilePage';
import BackendData from './pages/BackendData';

function App(): React.ReactElement {
  const plainSuomiFiPath = config.plainSuomiFiConfig.path;
  const mvpPath = config.mvpConfig.path;
  return (
    <ConfigChecker>
      <HandleCallback>
        <ClientProvider>
          <StoreProvider>
            <PageContainer>
              <Header />
              <Switch>
                <Route path={[plainSuomiFiPath, mvpPath]} exact>
                  <Index />
                </Route>
                <Route path={['/:anyPath/userTokens']} exact>
                  <Tokens />
                </Route>
                <Route path={[`${plainSuomiFiPath}/userinfo`]} exact>
                  <PlainSuomiFiUserInfo />
                </Route>
                <Route path={[`${mvpPath}/apiAccessTokens`]} exact>
                  <ApiAccessTokens />
                </Route>
                <Route path={[`${mvpPath}/backend`]} exact>
                  <BackendData />
                </Route>
                <Route path={[`${mvpPath}/profile`]} exact>
                  <ProfilePage />
                </Route>
                <Route path={['/authError']} exact>
                  <div>Autentikaatio epäonnistui</div>
                </Route>
                <Route path="*">404 - not found</Route>
              </Switch>
            </PageContainer>
          </StoreProvider>
        </ClientProvider>
      </HandleCallback>
    </ConfigChecker>
  );
}
export default App;
