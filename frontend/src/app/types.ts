export type PageSizeName = 'A4' | 'Letter' | 'Legal' | 'Custom';
export type Orientation = 'portrait' | 'landscape';
export type ObjectType = 'text' | 'rect' | 'circle' | 'line' | 'image' | 'qrcode' | 'barcode' | 'table' | 'chart';

export interface PageMargins { top: number; right: number; bottom: number; left: number; }
export interface PageConfig { size: PageSizeName; orientation: Orientation; width: number; height: number; margins: PageMargins; }
export interface BaseObjectProps { id: string; type: ObjectType; name: string; x: number; y: number; width: number; height: number; rotation: number; locked: boolean; hidden: boolean; region: 'header' | 'body' | 'footer'; }
export interface TextObjectProps extends BaseObjectProps { type: 'text'; text: string; fontFamily: string; fontSize: number; fontWeight: 'normal' | 'bold'; fontStyle: 'normal' | 'italic'; underline: boolean; color: string; backgroundColor: string | null; align: 'left' | 'center' | 'right' | 'justify'; letterSpacing: number; }
export interface RectObjectProps extends BaseObjectProps { type: 'rect'; fill: string; stroke: string; strokeWidth: number; rx: number; }
export interface CircleObjectProps extends BaseObjectProps { type: 'circle'; fill: string; stroke: string; strokeWidth: number; }
export interface LineObjectProps extends BaseObjectProps { type: 'line'; stroke: string; strokeWidth: number; }
export interface ImageObjectProps extends BaseObjectProps { type: 'image'; src: string; fit: 'contain' | 'cover' | 'stretch'; }
export interface QrCodeObjectProps extends BaseObjectProps { type: 'qrcode'; variable: string; foreground: string; background: string; }
export interface BarcodeObjectProps extends BaseObjectProps { type: 'barcode'; variable: string; format: 'CODE128' | 'EAN13' | 'UPC'; foreground: string; background: string; }
export interface TableColumn { id: string; header: string; field: string; width: number; align: 'left' | 'center' | 'right'; }
export interface TableObjectProps extends BaseObjectProps { type: 'table'; columns: TableColumn[]; rowHeight: number; headerHeight: number; headerBg: string; headerColor: string; borderColor: string; fontSize: number; dataSource: string; }
export interface ChartSeries { field: string; label: string; color: string; }
export interface ChartObjectProps extends BaseObjectProps { type: 'chart'; chartType: 'bar' | 'line' | 'donut'; title: string; dataSource: string; labelField: string; series: ChartSeries[]; }
export type TemplateObject = TextObjectProps | RectObjectProps | CircleObjectProps | LineObjectProps | ImageObjectProps | QrCodeObjectProps | BarcodeObjectProps | TableObjectProps | ChartObjectProps;
export interface WatermarkConfig { enabled: boolean; text: string; color: string; opacity: number; fontSize: number; rotation: number; }
export interface PaginationConfig { enabled: boolean; format: string; align: 'left' | 'center' | 'right'; }
export interface Template { version: string; name: string; page: PageConfig; watermark: WatermarkConfig; pagination: PaginationConfig; objects: TemplateObject[]; }

export function makePage(size: PageSizeName = 'A4', orientation: Orientation = 'portrait'): PageConfig {
  const dimensions = size === 'Letter' ? [612, 792] : size === 'Legal' ? [612, 1008] : [595, 842];
  return { size, orientation, width: orientation === 'portrait' ? dimensions[0] : dimensions[1], height: orientation === 'portrait' ? dimensions[1] : dimensions[0], margins: { top: 36, right: 36, bottom: 36, left: 36 } };
}