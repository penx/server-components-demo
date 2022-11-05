/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import {
  createContext,
  unstable_getCacheForType,
  unstable_useCacheRefresh,
  useContext,
} from 'react';

function createResponseCache() {
  return new Map();
}

export function useRefresh() {
  const refreshCache = unstable_useCacheRefresh();
  return function refresh(key, seededResponse) {
    refreshCache(createResponseCache, new Map([[key, seededResponse]]));
  };
}

export function useServerResponse(location) {
  const key = JSON.stringify(location);
  const getServerComponent = useGetServerComponent();
  let response, cache;
  try {
    // getCacheForType is not currently implemented in ReactDOMServer
    cache = unstable_getCacheForType(createResponseCache);
    response = cache.get(key);
  } catch (e) {
    cache = null;
    response = null;
  }
  if (response) {
    return response;
  }
  response = getServerComponent(key);
  if (cache) {
    cache.set(key, response);
  }
  return response;
}

const GetServerComponentContext = createContext();

export const GetServerComponentProvider = GetServerComponentContext.Provider;
const useGetServerComponent = () => useContext(GetServerComponentContext);
