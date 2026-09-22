/** Minimal type declarations for Cocos Creator Editor globals */
declare namespace Editor {
    namespace Panel {
        function open(panelId: string, ...args: any[]): void;
        function close(panelId: string): void;
        function define<T>(options: T): T;
    }
    namespace Message {
        function send(extensionName: string, message: string, ...args: any[]): void;
        function request(extensionName: string, message: string, ...args: any[]): Promise<any>;
        function broadcast(message: string, ...args: any[]): void;
    }
    namespace Profile {
        function getProject(extensionName: string, key: string, level?: string): Promise<any>;
        function setProject(extensionName: string, key: string, value: any, level?: string): Promise<void>;
        function getConfig(extensionName: string, key: string, level?: string): Promise<any>;
        function setConfig(extensionName: string, key: string, value: any, level?: string): Promise<void>;
    }
    namespace App {
        const path: string;
    }
    namespace Project {
        const path: string;
    }
    const projectPath: string;
    namespace Utils {
        namespace UUID {
            function compressUUID(uuid: string, minimal: boolean): string;
        }
    }
    function log(...args: any[]): void;
    function warn(...args: any[]): void;
    function error(...args: any[]): void;
}
