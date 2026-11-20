import * as fabric from 'fabric';
import { ImageObjectProps, TemplateObject } from './types';

export function imageFrame(item: TemplateObject, label: string): fabric.Group {
  return new fabric.Group([
    new fabric.Rect({ left: 0, top: 0, width: item.width, height: item.height, originX: 'left', originY: 'top', fill: '#f3f4f6', stroke: '#9ca3af', strokeWidth: 0, strokeDashArray: [4, 4] }),
    new fabric.Textbox(label, { left: 4, top: 4, width: Math.max(1, item.width - 8), originX: 'left', originY: 'top', fontSize: 10, fill: '#6b7280' }),
  ], {
    left: item.x, top: item.y, width: item.width, height: item.height, originX: 'left', originY: 'top',
    layoutManager: new fabric.LayoutManager(new fabric.FixedLayout()),
    clipPath: new fabric.Rect({ width: item.width, height: item.height, originX: 'center', originY: 'center' }),
  });
}

export async function buildImage(item: ImageObjectProps): Promise<fabric.Group> {
  if (!item.src) return imageFrame(item, 'Image');
  const image = await fabric.FabricImage.fromURL(item.src, { crossOrigin: 'anonymous' });
  const naturalWidth = Math.max(1, image.width);
  const naturalHeight = Math.max(1, image.height);
  const scaleX = item.width / naturalWidth;
  const scaleY = item.height / naturalHeight;
  const scale = item.fit === 'cover' ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
  image.set({ originX: 'left', originY: 'top', scaleX: item.fit === 'stretch' ? scaleX : scale, scaleY: item.fit === 'stretch' ? scaleY : scale });
  if (item.fit === 'cover') {
    image.set({ width: item.width / scale, height: item.height / scale, cropX: (naturalWidth - item.width / scale) / 2, cropY: (naturalHeight - item.height / scale) / 2 });
  }
  image.set({ left: (item.width - image.getScaledWidth()) / 2, top: (item.height - image.getScaledHeight()) / 2 });
  const frame = new fabric.Rect({ left: 0, top: 0, width: item.width, height: item.height, originX: 'left', originY: 'top', fill: 'transparent', strokeWidth: 0 });
  return new fabric.Group([frame, image], {
    left: item.x, top: item.y, width: item.width, height: item.height, originX: 'left', originY: 'top',
    layoutManager: new fabric.LayoutManager(new fabric.FixedLayout()),
    clipPath: new fabric.Rect({ width: item.width, height: item.height, originX: 'center', originY: 'center' }),
  });
}