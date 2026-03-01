import {
  FieldType,
  generateFormSchema,
  normalizeFormDefinition,
} from '@event-platform/schemas';

describe('Phone field schema support', () => {
  it('normalizes raw field type \"phone\" to FieldType.PHONE', () => {
    const normalized = normalizeFormDefinition({
      sections: [
        {
          id: 'section-1',
          title: 'Contact',
          fields: [
            {
              id: 'phone-1',
              key: 'phone',
              type: 'phone',
              label: 'Phone',
            },
          ],
        },
      ],
    });

    expect(normalized.sections[0].fields[0].type).toBe(FieldType.PHONE);
  });

  it('validates required phone fields as required string values', () => {
    const definition = normalizeFormDefinition({
      sections: [
        {
          id: 'section-1',
          title: 'Contact',
          fields: [
            {
              id: 'phone-1',
              key: 'phone',
              type: 'phone',
              label: 'Phone',
              validation: { required: true },
            },
          ],
        },
      ],
    });

    const schema = generateFormSchema(definition);

    const missing = schema.safeParse({ phone: '' });
    expect(missing.success).toBe(false);

    const valid = schema.safeParse({ phone: '+212 612345678' });
    expect(valid.success).toBe(true);
  });
});
