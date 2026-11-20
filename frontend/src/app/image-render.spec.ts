import * as fabric from 'fabric';
import { vi } from 'vitest';
import { buildImage } from './image-render';
import { makeObject } from './object-factory';

describe('Imported logo geometry', () => {
  afterEach(() => vi.restoreAllMocks());

  for (const [naturalWidth, naturalHeight] of [[400, 100], [100, 400]]) {
    it(`auto-fits a ${naturalWidth}x${naturalHeight} logo inside the letterhead without distortion`, async () => {
      const element = document.createElement('canvas');
      element.width = naturalWidth;
      element.height = naturalHeight;
      vi.spyOn(fabric.FabricImage, 'fromURL').mockResolvedValue(new fabric.FabricImage(element));
      const item = makeObject('image', { name: 'Bank logo', x: 36, y: 42, width: 76, height: 48, src: 'data:image/png;base64,logo', fit: 'contain' });
      if (item.type !== 'image') throw new Error('Expected image');
      const group = await buildImage(item);
      const image = group.getObjects()[1];
      expect(image.scaleX).toBe(image.scaleY);
      expect(image.getScaledWidth()).toBeLessThanOrEqual(76);
      expect(image.getScaledHeight()).toBeLessThanOrEqual(48);
      expect(image.getScaledWidth() / image.getScaledHeight()).toBeCloseTo(naturalWidth / naturalHeight);
      expect(group.getBoundingRect()).toEqual({ left: 36, top: 42, width: 76, height: 48 });
    });
  }

  for (const fit of ['contain', 'cover', 'stretch'] as const) {
    it(`preserves the saved image box with ${fit}`, async () => {
      const element = document.createElement('canvas');
      element.width = 200;
      element.height = 100;
      vi.spyOn(fabric.FabricImage, 'fromURL').mockResolvedValue(new fabric.FabricImage(element));
      const item = makeObject('image', { x: 36, y: 26, width: 44, height: 44, src: 'data:image/png;base64,logo', fit });
      if (item.type !== 'image') throw new Error('Expected image');
      const image = await buildImage(item);
      expect(image.getBoundingRect()).toEqual({ left: 36, top: 26, width: 44, height: 44 });
      expect(fabric.FabricImage.fromURL).toHaveBeenCalledWith(item.src, { crossOrigin: 'anonymous' });
    });
  }
});