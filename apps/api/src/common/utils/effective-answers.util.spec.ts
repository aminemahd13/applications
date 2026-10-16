import {
  applyPatchOpsToAnswers,
  collectFileFieldRefs,
  decodeJsonPointerPath,
  extractFileObjectIds,
  groupPatchOpsByVersionId,
  normalizeAnswersShape,
  readAnswerValue,
  resolveEffectiveAnswers,
  resolveFieldAnswerKey,
  resolveRequiredFileGate,
} from './effective-answers.util';

const FILE_A = '11111111-1111-4111-8111-111111111111';
const FILE_B = '22222222-2222-4222-8222-222222222222';
const FILE_C = '33333333-3333-4333-8333-333333333333';
const FILE_D = '44444444-4444-4444-8444-444444444444';

describe('normalizeAnswersShape', () => {
  it('returns an empty object for non-object input', () => {
    expect(normalizeAnswersShape(null)).toEqual({});
    expect(normalizeAnswersShape(undefined)).toEqual({});
    expect(normalizeAnswersShape('answers')).toEqual({});
    expect(normalizeAnswersShape(42)).toEqual({});
    expect(normalizeAnswersShape(['a'])).toEqual({});
  });

  it('unwraps the legacy { data: {...} } envelope', () => {
    expect(
      normalizeAnswersShape({ data: { name: 'Ada', city: 'Rabat' } }),
    ).toEqual({ name: 'Ada', city: 'Rabat' });
  });

  it('merges nested data over top-level keys and drops the envelope', () => {
    expect(
      normalizeAnswersShape({ name: 'old', extra: 1, data: { name: 'new' } }),
    ).toEqual({ name: 'new', extra: 1 });
  });

  it('keeps a lone non-object data key', () => {
    expect(normalizeAnswersShape({ data: 'plain' })).toEqual({ data: 'plain' });
  });

  it('drops a non-object data key when other keys exist', () => {
    expect(normalizeAnswersShape({ data: 'plain', name: 'Ada' })).toEqual({
      name: 'Ada',
    });
  });

  it('returns a copy and never mutates the input', () => {
    const input = { name: 'Ada' };
    const output = normalizeAnswersShape(input);
    expect(output).toEqual(input);
    expect(output).not.toBe(input);
  });
});

describe('decodeJsonPointerPath', () => {
  it('strips the leading slash', () => {
    expect(decodeJsonPointerPath('/firstName')).toBe('firstName');
  });

  it('decodes ~1 to / and ~0 to ~ (in that order)', () => {
    expect(decodeJsonPointerPath('/a~1b')).toBe('a/b');
    expect(decodeJsonPointerPath('/a~0b')).toBe('a~b');
    expect(decodeJsonPointerPath('/a~01')).toBe('a~1');
  });

  it('keeps nested segments joined as a literal key', () => {
    expect(decodeJsonPointerPath('/parent/child')).toBe('parent/child');
  });

  it('returns null for non-strings and the root pointer', () => {
    expect(decodeJsonPointerPath(undefined)).toBeNull();
    expect(decodeJsonPointerPath(12)).toBeNull();
    expect(decodeJsonPointerPath('')).toBeNull();
    expect(decodeJsonPointerPath('/')).toBeNull();
  });
});

describe('applyPatchOpsToAnswers', () => {
  it('applies replace, add and remove in order', () => {
    const result = applyPatchOpsToAnswers(
      { name: 'Ada', city: 'Rabat', school: 'Lycee' },
      [
        [{ op: 'replace', path: '/name', value: 'Ada L.' }],
        [
          { op: 'add', path: '/region', value: 'Casablanca' },
          { op: 'remove', path: '/school' },
        ],
        [{ op: 'replace', path: '/name', value: 'Ada Lovelace' }],
      ],
    );

    expect(result.answers).toEqual({
      name: 'Ada Lovelace',
      city: 'Rabat',
      region: 'Casablanca',
    });
    expect(result.editedKeys).toEqual(['name', 'region', 'school']);
  });

  it('decodes escaped pointer paths into literal keys', () => {
    const result = applyPatchOpsToAnswers({ 'a/b': 'old' }, [
      [{ op: 'replace', path: '/a~1b', value: 'new' }],
    ]);
    expect(result.answers).toEqual({ 'a/b': 'new' });
    expect(result.editedKeys).toEqual(['a/b']);
  });

  it('ignores unsupported ops and malformed entries', () => {
    const result = applyPatchOpsToAnswers({ name: 'Ada' }, [
      null,
      'not-an-array',
      { op: 'replace', path: '/name', value: 'object-not-array' },
      [
        null,
        'op',
        { op: 'test', path: '/name', value: 'Ada' },
        { op: 'move', from: '/name', path: '/other' },
        { op: 'copy', from: '/name', path: '/copy' },
        { op: 'replace', value: 'missing path' },
        { op: 'replace', path: 5, value: 'numeric path' },
        { op: 'replace', path: '/', value: 'root' },
      ],
    ]);

    expect(result.answers).toEqual({ name: 'Ada' });
    expect(result.editedKeys).toEqual([]);
  });

  it('tolerates a non-array ops list', () => {
    expect(
      applyPatchOpsToAnswers(
        { name: 'Ada' },
        undefined as unknown as unknown[],
      ),
    ).toEqual({ answers: { name: 'Ada' }, editedKeys: [] });
  });

  it('does not mutate the base answers', () => {
    const base = { name: 'Ada', school: 'Lycee' };
    const snapshot = JSON.parse(JSON.stringify(base));

    const result = applyPatchOpsToAnswers(base, [
      [
        { op: 'replace', path: '/name', value: 'Grace' },
        { op: 'remove', path: '/school' },
        { op: 'add', path: '/city', value: 'Fes' },
      ],
    ]);

    expect(base).toEqual(snapshot);
    expect(result.answers).not.toBe(base);
    expect(result.answers).toEqual({ name: 'Grace', city: 'Fes' });
  });

  it('unwraps a legacy envelope on the base before patching', () => {
    const result = applyPatchOpsToAnswers({ data: { name: 'Ada' } }, [
      [{ op: 'add', path: '/city', value: 'Fes' }],
    ]);
    expect(result.answers).toEqual({ name: 'Ada', city: 'Fes' });
  });
});

describe('extractFileObjectIds', () => {
  it('handles a bare string', () => {
    expect(extractFileObjectIds(FILE_A)).toEqual([FILE_A]);
  });

  it('handles { fileObjectId }', () => {
    expect(
      extractFileObjectIds({ fileObjectId: FILE_A, originalFilename: 'a.pdf' }),
    ).toEqual([FILE_A]);
  });

  it('handles { fileObjectIds: [] } and filters non-strings', () => {
    expect(
      extractFileObjectIds({ fileObjectIds: [FILE_A, 3, null, FILE_B] }),
    ).toEqual([FILE_A, FILE_B]);
  });

  it('flattens arrays of mixed shapes', () => {
    expect(
      extractFileObjectIds([
        { fileObjectId: FILE_A },
        FILE_B,
        [{ fileObjectIds: [FILE_C] }],
      ]),
    ).toEqual([FILE_A, FILE_B, FILE_C]);
  });

  it('returns [] for empty or unsupported values', () => {
    expect(extractFileObjectIds(null)).toEqual([]);
    expect(extractFileObjectIds('')).toEqual([]);
    expect(extractFileObjectIds(0)).toEqual([]);
    expect(extractFileObjectIds(true)).toEqual([]);
    expect(extractFileObjectIds({ url: 'https://example.com' })).toEqual([]);
  });
});

describe('collectFileFieldRefs', () => {
  const schema = {
    sections: [
      {
        id: 's1',
        title: 'Documents',
        fields: [
          { id: 'f-name', key: 'idNumber', type: 'text', label: 'ID number' },
          { id: 'f-photo', key: 'photo', type: 'file_upload', label: 'Photo' },
          {
            id: 'f-legacy',
            key: 'transcript',
            type: 'file',
            label: 'Transcript',
          },
          {
            id: 'f-extra',
            key: 'extras',
            type: 'file_upload',
            label: 'Extras',
          },
        ],
      },
    ],
  };

  it('collects every supported shape from file_upload fields only', () => {
    const refs = collectFileFieldRefs(schema, {
      idNumber: FILE_D, // bare uuid in a text field is NOT a file
      photo: FILE_A,
      transcript: [{ fileObjectId: FILE_B, originalFilename: 't.pdf' }],
      extras: { fileObjectIds: [FILE_C] },
    });

    expect(refs).toEqual([
      { fieldKey: 'photo', fileObjectId: FILE_A },
      { fieldKey: 'transcript', fileObjectId: FILE_B },
      { fieldKey: 'extras', fileObjectId: FILE_C },
    ]);
  });

  it('falls back to explicit { fileObjectId } shapes for keys outside the form', () => {
    const refs = collectFileFieldRefs(schema, {
      photo: { fileObjectId: FILE_A },
      oldUpload: [{ fileObjectId: FILE_B }],
      someUuidAnswer: FILE_C,
      bundle: { fileObjectIds: [FILE_D] },
    });

    expect(refs).toEqual([
      { fieldKey: 'photo', fileObjectId: FILE_A },
      { fieldKey: 'oldUpload', fileObjectId: FILE_B },
    ]);
  });

  it('uses an answer stored under the field id when the key is absent', () => {
    const refs = collectFileFieldRefs(
      {
        sections: [
          {
            id: 's1',
            title: 'Docs',
            fields: [
              {
                id: 'field-id',
                key: 'fieldKey',
                type: 'file_upload',
                label: 'Doc',
              },
            ],
          },
        ],
      },
      { 'field-id': FILE_A },
    );

    expect(refs).toEqual([{ fieldKey: 'field-id', fileObjectId: FILE_A }]);
  });

  it('dedupes by fileObjectId (first wins)', () => {
    const refs = collectFileFieldRefs(schema, {
      photo: [FILE_A, { fileObjectId: FILE_A }],
      transcript: { fileObjectId: FILE_A },
      copied: { fileObjectId: FILE_A },
    });

    expect(refs).toEqual([{ fieldKey: 'photo', fileObjectId: FILE_A }]);
  });

  it('skips ids that are not uuid-shaped', () => {
    const refs = collectFileFieldRefs(schema, {
      photo: 'https://example.com/photo.png',
      other: { fileObjectId: 'not-a-uuid' },
    });

    expect(refs).toEqual([]);
  });

  it('supports the legacy pages layout', () => {
    const refs = collectFileFieldRefs(
      {
        pages: [
          {
            id: 'p1',
            title: 'Page',
            fields: [{ id: 'cv', type: 'file_upload', label: 'CV' }],
          },
        ],
      },
      { cv: FILE_A },
    );

    expect(refs).toEqual([{ fieldKey: 'cv', fileObjectId: FILE_A }]);
  });

  it('falls back to the explicit-shape scan for a missing or bad schema', () => {
    const answers = {
      photo: FILE_A,
      upload: { fileObjectId: FILE_B },
    };

    expect(collectFileFieldRefs(null, answers)).toEqual([
      { fieldKey: 'upload', fileObjectId: FILE_B },
    ]);
    expect(collectFileFieldRefs('not a schema', answers)).toEqual([
      { fieldKey: 'upload', fileObjectId: FILE_B },
    ]);
    const throwingSchema = {
      get sections(): unknown {
        throw new Error('corrupt schema');
      },
    };
    expect(collectFileFieldRefs(throwingSchema, answers)).toEqual([
      { fieldKey: 'upload', fileObjectId: FILE_B },
    ]);
  });
});

describe('prototype-key hardening', () => {
  it('never lets a /__proto__ patch change the answers prototype', () => {
    const result = applyPatchOpsToAnswers({ name: 'Ada' }, [
      [
        { op: 'add', path: '/__proto__', value: { injected: FILE_A } },
        { op: 'replace', path: '/name', value: 'Grace' },
      ],
    ]);

    expect(Object.getPrototypeOf(result.answers)).toBe(Object.prototype);
    expect(result.answers.injected).toBeUndefined();
    expect(result.answers).toEqual({ name: 'Grace' });
    expect(result.editedKeys).toEqual(['name']);
  });

  it('drops own __proto__ keys from snapshots and legacy envelopes', () => {
    const snapshot: unknown = JSON.parse(
      `{"name":"Ada","__proto__":{"photo":"${FILE_A}"},"data":{"__proto__":{"cv":"${FILE_B}"},"city":"Fes"}}`,
    );

    const normalized = normalizeAnswersShape(snapshot);

    expect(Object.getPrototypeOf(normalized)).toBe(Object.prototype);
    expect(normalized).toEqual({ name: 'Ada', city: 'Fes' });
    expect(Object.keys(normalized)).not.toContain('__proto__');
    expect(readAnswerValue(normalized, 'photo')).toBeUndefined();
    expect(readAnswerValue(normalized, 'cv')).toBeUndefined();
  });
});

describe('groupPatchOpsByVersionId', () => {
  it('groups ops per version and preserves row order', () => {
    const opsA1 = [{ op: 'replace', path: '/a', value: 1 }];
    const opsB1 = [{ op: 'remove', path: '/b' }];
    const opsA2 = [{ op: 'replace', path: '/a', value: 2 }];

    const grouped = groupPatchOpsByVersionId([
      { submission_version_id: 'v-a', ops: opsA1 },
      { submission_version_id: 'v-b', ops: opsB1 },
      { submission_version_id: 'v-a', ops: opsA2 },
    ]);

    expect(Array.from(grouped.keys())).toEqual(['v-a', 'v-b']);
    expect(grouped.get('v-a')).toEqual([opsA1, opsA2]);
    expect(grouped.get('v-b')).toEqual([opsB1]);
  });

  it('tolerates empty input and malformed rows', () => {
    expect(groupPatchOpsByVersionId(undefined).size).toBe(0);
    expect(groupPatchOpsByVersionId(null).size).toBe(0);
    expect(
      groupPatchOpsByVersionId([
        null as unknown as { submission_version_id: string; ops: unknown },
        { submission_version_id: 5 as unknown as string, ops: [] },
      ]).size,
    ).toBe(0);
  });
});

describe('resolveEffectiveAnswers', () => {
  it('returns the normalized original, the patched answers and edited fields', () => {
    const result = resolveEffectiveAnswers(
      { data: { name: 'Ada', photo: FILE_A, school: 'Lycee' } },
      [
        [{ op: 'replace', path: '/photo', value: { fileObjectId: FILE_B } }],
        [
          { op: 'add', path: '/city', value: 'Fes' },
          { op: 'remove', path: '/school' },
        ],
      ],
    );

    expect(result.original).toEqual({
      name: 'Ada',
      photo: FILE_A,
      school: 'Lycee',
    });
    expect(result.answers).toEqual({
      name: 'Ada',
      photo: { fileObjectId: FILE_B },
      city: 'Fes',
    });
    expect(result.editedFields).toEqual([
      { key: 'photo', originalValue: FILE_A },
      { key: 'city' },
      { key: 'school', originalValue: 'Lycee' },
    ]);
    // Staff-added keys carry no originalValue property at all (clean JSON).
    expect(result.editedFields[1]).not.toHaveProperty('originalValue');
  });

  it('keeps an originalValue of null distinct from an added field', () => {
    const result = resolveEffectiveAnswers({ note: null }, [
      [{ op: 'replace', path: '/note', value: 'filled' }],
    ]);
    expect(result.editedFields).toEqual([{ key: 'note', originalValue: null }]);
    expect(result.editedFields[0]).toHaveProperty('originalValue', null);
  });

  it('handles a missing snapshot and missing patches', () => {
    expect(resolveEffectiveAnswers(null, undefined)).toEqual({
      original: {},
      answers: {},
      editedFields: [],
    });
    expect(resolveEffectiveAnswers({ name: 'Ada' }, null)).toEqual({
      original: { name: 'Ada' },
      answers: { name: 'Ada' },
      editedFields: [],
    });
  });

  it('decodes escaped pointer paths instead of writing stray keys', () => {
    const result = resolveEffectiveAnswers({ 'a/b': 'old', 'c~d': 'x' }, [
      [
        { op: 'replace', path: '/a~1b', value: 'new' },
        { op: 'remove', path: '/c~0d' },
      ],
    ]);
    expect(result.answers).toEqual({ 'a/b': 'new' });
    expect(Object.keys(result.answers)).not.toContain('a~1b');
  });
});

describe('resolveFieldAnswerKey / readAnswerValue', () => {
  const field = { id: 'field-id', key: 'fieldKey' };

  it('prefers the canonical key', () => {
    expect(resolveFieldAnswerKey({ fieldKey: 1, 'field-id': 2 }, field)).toBe(
      'fieldKey',
    );
    expect(resolveFieldAnswerKey({}, field)).toBe('fieldKey');
  });

  it('falls back to a legacy answer stored under the field id', () => {
    expect(resolveFieldAnswerKey({ 'field-id': 2 }, field)).toBe('field-id');
  });

  it('uses the id when the field has no key, and null when it has neither', () => {
    expect(resolveFieldAnswerKey({}, { id: 'only-id', key: '' })).toBe(
      'only-id',
    );
    expect(resolveFieldAnswerKey({}, { id: '', key: '' })).toBeNull();
  });

  it('reads own properties only', () => {
    expect(readAnswerValue({ a: 1 }, 'a')).toBe(1);
    expect(readAnswerValue({ a: 1 }, 'constructor')).toBeUndefined();
    expect(readAnswerValue({ a: 1 }, 'toString')).toBeUndefined();
    expect(readAnswerValue(null, 'a')).toBeUndefined();
  });
});

describe('resolveRequiredFileGate', () => {
  const schema = {
    sections: [
      {
        id: 's1',
        title: 'Documents',
        fields: [
          {
            id: 'f-toggle',
            key: 'hasPassport',
            type: 'checkbox',
            label: 'Has passport',
          },
          {
            id: 'f-cv',
            key: 'cv',
            type: 'file_upload',
            label: 'Curriculum vitae',
            validation: { required: true },
          },
          {
            id: 'f-passport',
            key: 'passport',
            type: 'file_upload',
            label: 'Passport',
            validation: { required: true },
            logic: {
              showWhen: {
                mode: 'all',
                rules: [
                  { fieldKey: 'hasPassport', operator: 'eq', value: true },
                ],
              },
            },
          },
          {
            id: 'f-extra',
            key: 'extra',
            type: 'file_upload',
            label: 'Extra',
          },
          {
            id: 'f-name',
            key: 'name',
            type: 'text',
            label: 'Name',
            validation: { required: true },
          },
        ],
      },
    ],
  };

  it('collects refs from required file fields of the effective answers only', () => {
    const gate = resolveRequiredFileGate(schema, {
      cv: [{ fileObjectId: FILE_A }, { fileObjectId: FILE_B }],
      extra: { fileObjectId: FILE_C },
      name: FILE_D,
    });

    expect(gate).toEqual({
      refs: [
        { fieldId: 'cv', fileObjectId: FILE_A },
        { fieldId: 'cv', fileObjectId: FILE_B },
      ],
      removedFields: [],
    });
  });

  it('normalizes a { data } envelope instead of silently finding no refs', () => {
    const gate = resolveRequiredFileGate(schema, { data: { cv: FILE_A } });
    expect(gate.refs).toEqual([{ fieldId: 'cv', fileObjectId: FILE_A }]);
  });

  it('reads a legacy answer stored under the field id but keys refs canonically', () => {
    const gate = resolveRequiredFileGate(schema, { 'f-cv': FILE_A });
    expect(gate.refs).toEqual([{ fieldId: 'cv', fileObjectId: FILE_A }]);
  });

  it.each([
    ['removed', {}],
    ['replaced with null', { cv: null }],
    ['replaced with an empty list', { cv: [] }],
    ['replaced with an empty string', { cv: '' }],
  ])('reports a required file field that staff emptied (%s)', (_label, effective) => {
    expect(
      resolveRequiredFileGate(schema, effective, {
        cv: { fileObjectId: FILE_A },
      }),
    ).toEqual({
      refs: [],
      removedFields: [{ key: 'cv', label: 'Curriculum vitae' }],
    });
  });

  it('detects a removal of a legacy field-id answer', () => {
    const gate = resolveRequiredFileGate(schema, {}, { 'f-cv': FILE_A });
    expect(gate.removedFields).toEqual([
      { key: 'cv', label: 'Curriculum vitae' },
    ]);
  });

  it('does not report fields that were already empty when submitted', () => {
    expect(resolveRequiredFileGate(schema, {}, {}).removedFields).toEqual([]);
    expect(
      resolveRequiredFileGate(schema, { cv: null }, { cv: null }).removedFields,
    ).toEqual([]);
  });

  it('does not report a replaced file, an optional field or a hidden field', () => {
    const gate = resolveRequiredFileGate(
      schema,
      { cv: FILE_B, hasPassport: false },
      { cv: FILE_A, extra: FILE_C, passport: FILE_D, hasPassport: true },
    );
    expect(gate).toEqual({
      refs: [{ fieldId: 'cv', fileObjectId: FILE_B }],
      removedFields: [],
    });
  });

  it('reports a removed field that is still visible', () => {
    const gate = resolveRequiredFileGate(
      schema,
      { cv: FILE_A, hasPassport: true },
      { cv: FILE_A, passport: FILE_D, hasPassport: true },
    );
    expect(gate.removedFields).toEqual([{ key: 'passport', label: 'Passport' }]);
  });

  it('skips removal detection when no original answers are given', () => {
    expect(resolveRequiredFileGate(schema, {}).removedFields).toEqual([]);
  });

  it('throws on an unparseable schema instead of skipping the gate', () => {
    const throwingSchema = {
      get sections(): unknown {
        throw new Error('corrupt schema');
      },
    };
    expect(() => resolveRequiredFileGate(throwingSchema, {})).toThrow(
      'corrupt schema',
    );
  });
});
