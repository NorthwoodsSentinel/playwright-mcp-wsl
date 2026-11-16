// detect.js: WSL detection from os.platform(), /proc/version and /dev/dxg, all faked per case.
import { describe, expect, it } from 'vitest';
import { NATIVE, WSL1, WSL2, fakeHost, loadFresh } from './helpers/load.mjs';

/** @returns {{ isWSL: () => boolean, wslVersion: () => number, hasDxgBridge: () => boolean }} */
const detect = () => loadFresh('detect.js');

describe('isWSL', () => {
  it('is false off Linux without reading /proc/version', () => {
    const { read } = fakeHost({ platform: 'darwin', procVersion: WSL2 });
    expect(detect().isWSL()).toBe(false);
    expect(read.mock.calls.some(([p]) => p === '/proc/version')).toBe(false);
  });

  it('is true for a WSL2 kernel string', () => {
    fakeHost({ procVersion: WSL2 });
    expect(detect().isWSL()).toBe(true);
  });

  it('is true for a WSL1 kernel string ("Microsoft", any case)', () => {
    fakeHost({ procVersion: WSL1 });
    expect(detect().isWSL()).toBe(true);
  });

  it('is true when only "wsl" appears', () => {
    fakeHost({ procVersion: 'Linux version 6.6.0-custom-WSL' });
    expect(detect().isWSL()).toBe(true);
  });

  it('is false for a native Linux kernel', () => {
    fakeHost({ procVersion: NATIVE });
    expect(detect().isWSL()).toBe(false);
  });

  it('is false when /proc/version cannot be read', () => {
    fakeHost({ procVersion: null });
    expect(detect().isWSL()).toBe(false);
  });
});

describe('wslVersion', () => {
  it('is 0 when not WSL', () => {
    fakeHost({ procVersion: NATIVE });
    expect(detect().wslVersion()).toBe(0);
  });

  it('is 2 for "microsoft-standard-WSL2"', () => {
    fakeHost({ procVersion: WSL2 });
    expect(detect().wslVersion()).toBe(2);
  });

  it('is 2 for "microsoft-standard" without the WSL2 suffix', () => {
    fakeHost({ procVersion: 'Linux version 5.10.16.3-microsoft-standard (gcc)' });
    expect(detect().wslVersion()).toBe(2);
  });

  it('is 2 for "wsl2" without "microsoft"', () => {
    fakeHost({ procVersion: 'Linux version 6.6.0-custom-wsl2' });
    expect(detect().wslVersion()).toBe(2);
  });

  it('is 1 for "Microsoft" without "standard"', () => {
    fakeHost({ procVersion: WSL1 });
    expect(detect().wslVersion()).toBe(1);
  });

  it('is 0 when the second read of /proc/version fails', () => {
    const { read } = fakeHost({ procVersion: WSL2 });
    const real = read.getMockImplementation();
    let procReads = 0;
    read.mockImplementation(
      /** @type {NonNullable<typeof real>} */ (
        /** @type {unknown} */ (
          /** @param {import('node:fs').PathOrFileDescriptor} p @param {unknown[]} rest */
          (p, ...rest) => {
            if (p === '/proc/version' && ++procReads === 2) throw new Error('EIO');
            return Reflect.apply(/** @type {NonNullable<typeof real>} */ (real), undefined, [p, ...rest]);
          }
        )
      ),
    );
    expect(detect().wslVersion()).toBe(0);
    expect(procReads).toBe(2);
  });
});

describe('hasDxgBridge', () => {
  it('is true when /dev/dxg exists', () => {
    fakeHost({ dxg: true });
    expect(detect().hasDxgBridge()).toBe(true);
  });

  it('is false when /dev/dxg is absent', () => {
    fakeHost({ dxg: false });
    expect(detect().hasDxgBridge()).toBe(false);
  });

  it('is false when the existence check throws', () => {
    fakeHost({ dxg: 'throw' });
    expect(detect().hasDxgBridge()).toBe(false);
  });
});
