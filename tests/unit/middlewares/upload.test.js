const { isAllowedFile } = require('../../../src/middlewares/upload');

const file = (originalname, mimetype) => ({ originalname, mimetype });

describe('upload file filter', () => {
  test.each([
    ['scan.pdf', 'application/pdf'],
    ['cccd.jpg', 'image/jpeg'],
    ['CCCD.JPG', 'image/jpeg'],
    ['photo.jpeg', 'image/jpeg'],
    ['PHOTO.JPEG', 'image/jpeg'],
    ['seal.png', 'image/png'],
    ['contract.doc', 'application/msword'],
    ['contract.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ])('accepts %s', (name, mime) => {
    expect(isAllowedFile(file(name, mime))).toBe(true);
  });

  test.each([
    ['report.pdfx', 'application/pdf'],
    ['virus.exe', 'application/pdf'],
    ['fake.pdf', 'application/x-msdownload'],
    ['noext', 'application/pdf'],
    ['image.gif', 'image/gif'],
  ])('rejects %s (%s)', (name, mime) => {
    expect(isAllowedFile(file(name, mime))).toBe(false);
  });
});
