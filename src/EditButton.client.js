/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import {useTransition} from 'react';

import {useLocation} from './LocationContext.client';

export default function EditButton({noteId, children}) {
  const [location, setLocation] = useLocation();
  const [isPending, startTransition] = useTransition();
  const isDraft = noteId == null;
  return (
    <a
      className={[
        'edit-button',
        isDraft ? 'edit-button--solid' : 'edit-button--outline',
      ].join(' ')}
      disabled={isPending}
      href={`?${new URLSearchParams({
        selectedId: noteId,
        isEditing: true,
        ...(location.searchText
          ? {
              searchText: location.searchText,
            }
          : {}),
      })}`}
      onClick={(e) => {
        startTransition(() => {
          setLocation((loc) => ({
            selectedId: noteId,
            isEditing: true,
            searchText: loc.searchText,
          }));
        });
        e.preventDefault();
      }}
      role="menuitem">
      {children}
    </a>
  );
}
