import * as fabric from 'fabric';
import { TableObjectProps } from './types';
import { resolveData } from './chart-render';

export function buildTable(item: TableObjectProps, data?: Record<string, unknown>): fabric.Group {
  const rows = data ? resolveData(data, item.dataSource) : undefined;
  const width = Math.max(1, item.width);
  const height = Math.max(1, item.height);
  const headerHeight = Math.min(height, Math.max(1, item.headerHeight));
  const columns = item.columns.length ? item.columns : [{ header: 'Column', field: 'field', width, align: 'left' as const }];
  const totalWidth = columns.reduce((total, column) => total + Math.max(1, column.width), 0);
  const objects: fabric.FabricObject[] = [];
  const addCell = (text: string, left: number, top: number, cellWidth: number, cellHeight: number, header: boolean, align: 'left' | 'center' | 'right') => {
    objects.push(new fabric.Rect({ left, top, width: cellWidth, height: cellHeight, originX: 'left', originY: 'top', fill: header ? item.headerBg : '#ffffff', stroke: item.borderColor, strokeWidth: 0.5 }));
    const label = new fabric.Textbox(text, {
      left: left + 4, top: top + 3, width: Math.max(1, cellWidth - 8),
      originX: 'left', originY: 'top', fontSize: item.fontSize,
      fontWeight: header ? 'bold' : 'normal', fill: header ? item.headerColor : '#1f2937',
      textAlign: align, splitByGrapheme: true,
    });
    label.clipPath = new fabric.Rect({ width: cellWidth, height: cellHeight, originX: 'center', originY: 'center' });
    objects.push(label);
  };
  let left = 0;
  for (const column of columns) {
    const cellWidth = width * Math.max(1, column.width) / totalWidth;
    addCell(column.header, left, 0, cellWidth, headerHeight, true, column.align);
    const rowHeight = Math.max(1, item.rowHeight);
    for (let top = headerHeight, row = 0; top < height; top += rowHeight, row++) {
      const cell = Array.isArray(rows) ? rows[row]?.[column.field] : undefined;
      const value = data ? (cell === null || cell === undefined || typeof cell === 'object' ? '' : String(cell)) : row < 2 ? column.field === 'product' ? 'Sample Item' : column.field === 'qty' ? String(row + 1) : '0.00' : '';
      addCell(value, left, top, cellWidth, Math.min(rowHeight, height - top), false, column.align);
    }
    left += cellWidth;
  }
  return new fabric.Group(objects, {
    left: item.x, top: item.y, width, height, originX: 'left', originY: 'top',
    layoutManager: new fabric.LayoutManager(new fabric.FixedLayout()),
    clipPath: new fabric.Rect({ width, height, originX: 'center', originY: 'center' }),
  });
}