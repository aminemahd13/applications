import {
  applyPatchOpsToAnswers,
  collectFileFieldRefs,
  decodeJsonPointerPath,
  extractFileObjectIds,
  normalizeAnswersShape,
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
