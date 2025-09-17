import axios from "axios";
import { basename } from "node:path";
import { AppError, ErrorCodes } from "../utils/errors.js";

export interface ResolvedFile {
  buffer: Buffer;
  filename: string;
  contentType?: string;
}

const DATA_URI_REGEX = /^data:(?<mime>.*?);base64,(?<data>.+)$/;

const stripFileName = (input: string) => basename(input).replace(/[^\w\-.]+/g, "_");

const stripControlCharacters = (value: string) =>
  Array.from(value)
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code === 10 || code === 13 || (code >= 32 && code !== 127);
    })
    .join("");

export const resolveFileInput = async (
  file: string,
  filename: string,
  maxBytes: number
): Promise<ResolvedFile> => {
  if (file.startsWith("data:")) {
    const match = DATA_URI_REGEX.exec(file);
    if (!match?.groups?.data) {
      throw new AppError(400, ErrorCodes.FILE_INVALID_SOURCE, "Invalid data URI provided for file upload");
    }

    const buffer = Buffer.from(match.groups.data, "base64");
    if (buffer.byteLength > maxBytes) {
      throw new AppError(
        413,
        ErrorCodes.TELEGRAM_DOCUMENT_TOO_LARGE,
        "File exceeds allowed size limit"
      );
    }

    return {
      buffer,
      filename: stripControlCharacters(stripFileName(filename || "document")),
      contentType: match.groups.mime || "application/octet-stream"
    };
  }

  let url: URL;
  try {
    url = new URL(file);
  } catch (error) {
    throw new AppError(
      400,
      ErrorCodes.FILE_INVALID_SOURCE,
      "File must be a valid http(s) URL or base64 data URI",
      error
    );
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new AppError(
      400,
      ErrorCodes.FILE_INVALID_SOURCE,
      "Only http(s) URLs are supported for document uploads"
    );
  }

  try {
    const response = await axios.get<ArrayBuffer>(url.href, {
      responseType: "arraybuffer",
      timeout: 15_000,
      maxContentLength: maxBytes,
      proxy: false
    });

    const buffer = Buffer.from(response.data);
    if (buffer.byteLength > maxBytes) {
      throw new AppError(
        413,
        ErrorCodes.TELEGRAM_DOCUMENT_TOO_LARGE,
        "File exceeds allowed size limit"
      );
    }

    return {
      buffer,
      filename: stripControlCharacters(stripFileName(filename || url.pathname.split("/").pop() || "document")),
      contentType: response.headers["content-type"] as string | undefined
    };
  } catch (error) {
    throw new AppError(
      502,
      ErrorCodes.FILE_DOWNLOAD_FAILED,
      "Failed to download document from provided URL",
      error
    );
  }
};
