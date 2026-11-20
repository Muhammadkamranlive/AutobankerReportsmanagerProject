import { makeObject } from '../object-factory';
import { ObjectType, TemplateObject } from '../types';

type ObjectOf<Type extends ObjectType> = Extract<TemplateObject, { type: Type }>;

function create<Type extends ObjectType>(type: Type, overrides: Partial<ObjectOf<Type>>): ObjectOf<Type> {
  return makeObject(type, overrides) as ObjectOf<Type>;
}

export const createText = (text = 'Text', overrides: Partial<ObjectOf<'text'>> = {}) =>
  create('text', { text, ...overrides });
export const createRect = (overrides: Partial<ObjectOf<'rect'>> = {}) => create('rect', overrides);
export const createLine = (overrides: Partial<ObjectOf<'line'>> = {}) => create('line', overrides);
export const createTable = (overrides: Partial<ObjectOf<'table'>> = {}) => create('table', overrides);
export const createQrCode = (overrides: Partial<ObjectOf<'qrcode'>> = {}) =>
  create('qrcode', { name: 'QR Code', ...overrides });
export const createBarcode = (overrides: Partial<ObjectOf<'barcode'>> = {}) => create('barcode', overrides);
export const createCircle = (overrides: Partial<ObjectOf<'circle'>> = {}) => create('circle', overrides);