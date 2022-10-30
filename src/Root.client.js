/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import {useState, Suspense, useCallback, use} from 'react';
import {ErrorBoundary} from 'react-error-boundary';

import {useServerResponse} from './Cache.client';
import {LocationContext} from './LocationContext.client';

export default function Root({initialCache, initialLocation}) {
  return (
    <Suspense fallback={null}>
      <ErrorBoundary FallbackComponent={Error}>
        <Content initialLocation={initialLocation} />
      </ErrorBoundary>
    </Suspense>
  );
}

function pushHistory(location) {
  const params = {};
  if (location.searchText?.length > 0) {
    params.searchText = location.searchText;
  }
  if (location.isEditing === true) {
    params.isEditing = true;
  }
  if (location.selectedId) {
    params.selectedId = location.selectedId;
  }
  const searchParams = new URLSearchParams(params);
  window.history.pushState(location, '', `?${searchParams}`);
}

function Content({initialLocation}) {
  const [location, setLocationState] = useState(initialLocation);
  const setLocation = useCallback((l) => {
    if (typeof l === 'function') {
      setLocationState((prev) => {
        const newLoc = l(prev);
        pushHistory(newLoc);
        return newLoc;
      });
    } else {
      pushHistory(l);
      setLocationState(l);
    }
  });
  const response = useServerResponse(location);

  return (
    <LocationContext.Provider value={[location, setLocation]}>
      {use(response)}
    </LocationContext.Provider>
  );
}

function Error({error}) {
  return (
    <div>
      <h1>Application Error</h1>
      <pre style={{whiteSpace: 'pre-wrap'}}>{error.stack}</pre>
    </div>
  );
}
