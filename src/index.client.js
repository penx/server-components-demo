/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import {hydrateRoot} from 'react-dom/client';
import Root from './Root.client';
import {createFromFetch} from 'react-server-dom-webpack/client';

const search = new URLSearchParams(window.location.search);
const initialLocation = {
  selectedId: Number(search.get('selectedId')) || null,
  isEditing: search.get('isEditing') === 'true',
  searchText: search.get('searchText') || '',
};

const getServerComponent = (key) =>
  createFromFetch(fetch('/react?location=' + encodeURIComponent(key)));

hydrateRoot(
  document,
  <Root
    assets={window.assetManifest}
    getServerComponent={getServerComponent}
    initialLocation={initialLocation}
  />
);
