import EPub from 'epub2';

/** epub2 expects an array, while XML parsers return an object for one item. */
export class CompatibleEPub extends EPub {
  override parseManifest(manifest: Parameters<EPub['parseManifest']>[0]): void {
    const item = manifest.item;
    super.parseManifest(item && !Array.isArray(item) ? { ...manifest, item: [item] } : manifest);
  }
}
