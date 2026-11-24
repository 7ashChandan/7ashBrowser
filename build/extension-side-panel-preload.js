var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// src/extension-side-panel-compat.js
var require_extension_side_panel_compat = __commonJS({
  "src/extension-side-panel-compat.js"(exports2, module2) {
    function installBrowserWindowsCompatibility2(target = globalThis) {
      let browserApi = target.browser;
      let failureReported = false;
      const exposeWindows = () => {
        if (!browserApi || "windows" in browserApi) return true;
        const windowsApi = target.chrome?.windows;
        if (!windowsApi || !Object.isExtensible(browserApi)) {
          if (!failureReported) {
            console.error("7ash Browser could not expose chrome.windows as browser.windows.");
            failureReported = true;
          }
          return false;
        }
        Object.defineProperty(browserApi, "windows", {
          configurable: true,
          enumerable: true,
          value: windowsApi,
          writable: true
        });
        return true;
      };
      if (browserApi && "windows" in browserApi) return true;
      const descriptor = Object.getOwnPropertyDescriptor(target, "browser");
      if (descriptor && !descriptor.configurable) {
        if (browserApi && exposeWindows()) return true;
        if (!failureReported) {
          console.error("7ash Browser could not install its browser.windows compatibility bridge.");
        }
        return false;
      }
      Object.defineProperty(target, "browser", {
        configurable: true,
        enumerable: descriptor ? descriptor.enumerable : true,
        get() {
          exposeWindows();
          return browserApi;
        },
        set(value) {
          browserApi = value;
          exposeWindows();
        }
      });
      return exposeWindows();
    }
    module2.exports = { installBrowserWindowsCompatibility: installBrowserWindowsCompatibility2 };
  }
});

// src/extension-side-panel-preload.js
var { contextBridge } = require("electron");
var {
  installBrowserWindowsCompatibility
} = require_extension_side_panel_compat();
contextBridge.executeInMainWorld({
  func: installBrowserWindowsCompatibility
});
