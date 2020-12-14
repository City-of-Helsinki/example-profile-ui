import React from 'react';
import ReactDOM from 'react-dom';
// eslint-disable-next-line import/no-namespace
import * as Sentry from '@sentry/browser';

import './index.css';
import BrowserApp from './BrowserApp';
// eslint-disable-next-line import/no-namespace
import * as serviceWorker from './serviceWorker';

const ENVS_WITH_SENTRY = ['staging', 'production'];

if (
  process.env.REACT_APP_ENVIRONMENT &&
  ENVS_WITH_SENTRY.includes(process.env.REACT_APP_ENVIRONMENT)
) {
  Sentry.init({
    dsn: process.env.REACT_APP_SENTRY_DSN,
    environment: process.env.REACT_APP_ENVIRONMENT
  });
}

ReactDOM.render(<BrowserApp />, document.getElementById('root'));

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
