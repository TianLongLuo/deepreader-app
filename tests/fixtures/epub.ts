import JSZip from 'jszip';

/** Synthetic book only: a readable spine, never user uploads. */
export async function epubFixture(singleManifest = false) {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  zip.file('OEBPS/content.opf', '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">upload-fixture</dc:identifier><dc:title>Upload Fixture</dc:title><dc:language>en</dc:language></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>' + (singleManifest ? '' : '<item id="style" href="style.css" media-type="text/css"/>') + '</manifest><spine><itemref idref="chapter"/></spine></package>');
  zip.file('OEBPS/chapter.xhtml', '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Fixture</title></head><body><p>A synthetic book.</p></body></html>');
  zip.file('OEBPS/style.css', 'p { color: inherit; }');
  return zip.generateAsync({ type: 'nodebuffer' });
}
