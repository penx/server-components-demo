/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import {useState, useTransition} from 'react';

import {useLocation} from './LocationContext.client';
import Spinner from './Spinner';

export default function SearchField() {
  const [location, setLocation] = useLocation();
  const [text, setText] = useState(location.searchText);
  const [isSearching, startSearching] = useTransition();
  return (
    <form
      className="search"
      autoComplete="off"
      role="search"
      onSubmit={(e) => e.preventDefault()}>
      <label className="offscreen" htmlFor="sidebar-search-input">
        Search for a note by title
      </label>
      {location.selectedId ? (
        <input type="hidden" name="selectedId" value={location.selectedId} />
      ) : null}
      {location.isEditing ? (
        <input type="hidden" name="isEditing" value={location.isEditing} />
      ) : null}
      <input
        id="sidebar-search-input"
        name="searchText"
        placeholder="Search"
        value={text}
        onChange={(e) => {
          const newText = e.target.value;
          setText(newText);
          startSearching(() => {
            setLocation((loc) => ({
              ...loc,
              searchText: newText,
            }));
          });
        }}
      />
      <Spinner active={isSearching} />
    </form>
  );
}
