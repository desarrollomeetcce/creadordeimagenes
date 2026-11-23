/** Two modest photos at a time; large files and videos keep the memory budget of a single upload. */
export async function uploadStudioBatch<T>(
  files: readonly File[],
  send: (file: File, index: number) => Promise<T>,
  saved: (value: T) => void,
) {
  const smallPhoto = (file: File | undefined) => !!file &&
    /\.(png|jpe?g|webp)$/i.test(file.name) && file.size <= 8 * 1024 * 1024;
  for (let start = 0; start < files.length;) {
    const width = smallPhoto(files[start]) && smallPhoto(files[start + 1]) ? 2 : 1;
    const results = await Promise.allSettled(
      files.slice(start, start + width).map((file, offset) =>
        send(file, start + offset).then(value => { saved(value); }),
      ),
    );
    const failure = results.find(r => r.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
    start += width;
  }
}
