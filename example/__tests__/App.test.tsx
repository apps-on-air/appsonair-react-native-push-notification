/**
 * @format
 *
 * A smoke test, not a feature test: it mounts the harness against the real
 * src/index.tsx with a stubbed native module (see jest.setup.js), so it catches
 * the library throwing at import, the event subscriptions in App's effect
 * blowing up, and the module failing to resolve on either architecture path.
 */

import React from 'react';
import renderer, {act} from 'react-test-renderer';

import App from '../App';

it('mounts and unmounts against a stubbed native module', async () => {
  let tree: renderer.ReactTestRenderer | undefined;

  // `act` around both halves: App subscribes in an effect and the library's
  // promises settle on the microtask queue, so without it React flushes those
  // effects after Jest has torn the environment down.
  await act(async () => {
    tree = renderer.create(<App />);
  });

  expect(tree?.toJSON()).toBeTruthy();

  await act(async () => {
    tree?.unmount();
  });
});
