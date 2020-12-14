import React from 'react';
import { useSelector } from 'react-redux';

import styles from './styles.module.css';
import { StoreState } from '../clients/redux/index';
import DemoWrapper from './DemoWrapper';

const ReduxConsumer = (): React.ReactElement => {
  const state: StoreState = useSelector((storeState: StoreState) => storeState);
  const contentElementStyle = styles['content-element'];
  const { initialized, authenticated, user } = state;
  if (!initialized) {
    return (
      <DemoWrapper title="Redux-kuuntelija">
        <div className={contentElementStyle}>Haetaan kirjautumistietoja...</div>
      </DemoWrapper>
    );
  }
  if (authenticated) {
    const name = user ? `${user.given_name} ${user.family_name}` : '';
    return (
      <DemoWrapper title="Redux-kuuntelija">
        <div className={contentElementStyle}>
          <h3>Olet kirjautunut, {name}</h3>
        </div>
      </DemoWrapper>
    );
  }
  return (
    <DemoWrapper title="Redux-kuuntelija">
      <div className={contentElementStyle}>
        <h3>Et ole kirjautunut</h3>
      </div>
    </DemoWrapper>
  );
};

export default ReduxConsumer;
