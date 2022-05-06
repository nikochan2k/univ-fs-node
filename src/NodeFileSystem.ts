import * as fs from "fs";
import {
  AbstractDirectory,
  AbstractFile,
  AbstractFileSystem,
  createError,
  ErrorLike,
  FileSystemOptions,
  joinPaths,
  NoModificationAllowedError,
  normalizePath,
  NotFoundError,
  NotReadableError,
  NotSupportedError,
  PatchOptions,
  PathExistError,
  QuotaExceededError,
  Stats,
  SyntaxError,
  TypeMismatchError,
  URLOptions,
} from "univ-fs";
import { pathToFileURL } from "url";
import { NodeDirectory } from "./NodeDirectory";
import { NodeFile } from "./NodeFile";

export function convertError(
  repository: string,
  path: string,
  err: NodeJS.ErrnoException,
  write: boolean
) {
  const e = err as ErrorLike;
  const code = err.code;
  if (code) {
    switch (code) {
      case "ENOENT": // No such file or directory
        return createError({
          name: NotFoundError.name,
          repository,
          path,
          e,
        });
      case "ENOTDIR": // Not a directory
      case "EISDIR": // Is a directory
        return createError({
          name: TypeMismatchError.name,
          repository,
          path,
          e,
        });
      case "EEXIST": // File exists
        return createError({
          name: PathExistError.name,
          repository,
          path,
          e,
        });
      case "EDQUOT": // Quota exceeded
        return createError({
          name: QuotaExceededError.name,
          repository,
          path,
          e,
        });
      case "EINVAL": // Invalid argument
        return createError({
          name: SyntaxError.name,
          repository,
          path,
          e,
        });
    }
    if (0 <= code.indexOf("NOSUPPORT")) {
      return createError({
        name: NotSupportedError.name,
        repository,
        path,
        e,
      });
    }
  }
  if (write) {
    return createError({
      name: NoModificationAllowedError.name,
      repository,
      path,
      e,
    });
  } else {
    return createError({
      name: NotReadableError.name,
      repository,
      path,
      e,
    });
  }
}

export class NodeFileSystem extends AbstractFileSystem {
  constructor(rootDir: string, options?: FileSystemOptions) {
    super(normalizePath(rootDir), options);
    fs.mkdirSync(rootDir, { recursive: true });
  }

  public _doGetDirectory(path: string): Promise<AbstractDirectory> {
    return Promise.resolve(new NodeDirectory(this, path));
  }

  public _doGetFile(path: string): Promise<AbstractFile> {
    return Promise.resolve(new NodeFile(this, path));
  }

  public _doHead(path: string): Promise<Stats> {
    return new Promise<Stats>((resolve, reject) => {
      fs.stat(this.getFullPath(path), (err, stats) => {
        if (err) {
          reject(convertError(this.repository, path, err, false));
        } else {
          if (stats.isDirectory()) {
            resolve({
              accessed: stats.atimeMs,
              modified: stats.mtimeMs,
            });
          } else {
            resolve({
              size: stats.size,
              accessed: stats.atimeMs,
              modified: stats.mtimeMs,
            });
          }
        }
      });
    });
  }

  public _doPatch(
    path: string,
    stats: Stats,
    props: Stats,
    _options: PatchOptions // eslint-disable-line
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      fs.utimes(
        this.getFullPath(path),
        props.accessed ?? (stats.accessed as number),
        props.modified ?? (stats.modified as number),
        (err) => {
          if (err) {
            reject(convertError(this.repository, path, err, true));
          } else {
            resolve();
          }
        }
      );
    });
  }

  public _doToURL(
    path: string,
    _isDirectory: boolean, // eslint-disable-line
    _options?: URLOptions // eslint-disable-line
  ): Promise<string> {
    return Promise.resolve(pathToFileURL(this.getFullPath(path)).href);
  }

  public canPatchAccessed(): boolean {
    return true;
  }

  public canPatchCreated(): boolean {
    return false;
  }

  public canPatchModified(): boolean {
    return true;
  }

  public supportDirectory(): boolean {
    return true;
  }

  protected getFullPath(path: string) {
    return joinPaths(this.repository, path);
  }
}
