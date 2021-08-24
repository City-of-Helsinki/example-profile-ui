import React, { useState } from 'react';
import { Notification } from 'hds-react';

import { useClientErrorDetection, useClient } from '../client/hooks';
import { ClientErrorObject, ClientError } from '../client';
import styles from './styles.module.css';

const ErrorPrompt = (
  props: React.PropsWithChildren<unknown>
): React.ReactElement | null => {
  const [dismissedError, setDismissedError] = useState<ClientErrorObject>(
    undefined
  );
  const newError = useClientErrorDetection();
  const client = useClient();
  const lastErrorType = dismissedError && dismissedError.type;
  const newErrorType = newError && newError.type;
  if (lastErrorType === newErrorType) {
    return null;
  }
  const sessionEndedElsewhere =
    newErrorType === ClientError.UNEXPECTED_AUTH_CHANGE;
  const Prompt = (): React.ReactElement | null =>
    newError ? (
      <div className={styles['error-prompt-container']}>
        <div className={styles['error-prompt-content']}>
          <Notification
            label="Error"
            type="error"
            onClose={(): void => {
              setDismissedError(newError);
              if (sessionEndedElsewhere) {
                client.logout();
              }
            }}
            dismissible
            closeButtonLabelText="Sulje">
            {sessionEndedElsewhere ? (
              <p>
                Käyttäjän sessio on päättynyt ilman uloskirjautumista tässä
                selainikkunassa. <br /> <br /> Sinut kirjataan ulos myös tästä,
                kun suljet tämän ilmoituksen.
              </p>
            ) : (
              <>
                <p>Virhekoodi: {newErrorType}.</p>
                <p>Viesti: {newError.message || ''}</p>
              </>
            )}
          </Notification>
        </div>
        <div className={styles['error-prompt-overlay']} />
      </div>
    ) : null;

  return (
    <>
      {props.children}
      <Prompt />
    </>
  );
};

export default ErrorPrompt;
