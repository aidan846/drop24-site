import { DetailedError, Upload, isSupported } from "tus-js-client";

export const RESUMABLE_UPLOAD_THRESHOLD_BYTES = 6 * 1024 * 1024;

// iOS browsers and embedded mobile webviews can leave a cross-origin tus
// request pending indefinitely after the user picks a file. Signed PUT uploads
// work reliably there, so reserve resumable transfers for desktop browsers.
export function shouldUseResumableUpload(file: File) {
  return file.size > RESUMABLE_UPLOAD_THRESHOLD_BYTES
    && !window.matchMedia("(pointer: coarse), (max-width: 639px)").matches;
}

interface ResumableUploadOptions {
  apiKey: string;
  bucket: string;
  endpoint: string;
  file: File;
  objectPath: string;
  onProgress: (percentage: number) => void;
  signedToken: string;
}

function validatedResumableEndpoint(endpoint: string) {
  const url = new URL(endpoint);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error("The resumable upload endpoint must use HTTPS.");
  }
  if (url.pathname !== "/storage/v1/upload/resumable/sign" || url.search || url.hash) {
    throw new Error("The resumable upload endpoint is invalid.");
  }
  return url.toString();
}

function validatedSignedToken(signedToken: string) {
  const token = signedToken.trim();
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
    throw new Error("The upload authorization token is invalid. Please retry the upload.");
  }
  return token;
}

function uploadErrorMessage(error: Error) {
  if (error instanceof DetailedError) {
    const responseBody = error.originalResponse?.getBody();
    if (responseBody) {
      try {
        const parsed = JSON.parse(responseBody) as {
          error?: string;
          message?: string;
        };
        return parsed.message || parsed.error || error.message;
      } catch {
        return responseBody;
      }
    }
  }
  return error.message;
}

export function uploadResumable({
  apiKey,
  bucket,
  endpoint,
  file,
  objectPath,
  onProgress,
  signedToken,
}: ResumableUploadOptions) {
  if (!isSupported) {
    return Promise.reject(new Error("Resumable uploads are not supported by this browser."));
  }

  let uploadEndpoint: string;
  let uploadToken: string;
  try {
    if (!apiKey.trim()) {
      throw new Error("The upload API key is missing. Please retry the upload.");
    }
    uploadEndpoint = validatedResumableEndpoint(endpoint);
    uploadToken = validatedSignedToken(signedToken);
  } catch (error) {
    return Promise.reject(error);
  }

  return new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: uploadEndpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        apikey: apiKey.trim(),
        "x-signature": uploadToken,
      },
      uploadDataDuringCreation: true,
      storeFingerprintForResuming: false,
      removeFingerprintOnSuccess: true,
      chunkSize: RESUMABLE_UPLOAD_THRESHOLD_BYTES,
      metadata: {
        bucketName: bucket,
        objectName: objectPath,
        contentType: file.type || "application/octet-stream",
        cacheControl: "3600",
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        const percentage =
          bytesTotal > 0 ? Math.min(99, Math.round((bytesUploaded / bytesTotal) * 100)) : 0;
        onProgress(percentage);
      },
      onError: (error) => reject(new Error(uploadErrorMessage(error))),
      onSuccess: () => {
        onProgress(100);
        resolve();
      },
    });

    upload.start();
  });
}
