using System.Diagnostics;
using System.IO;
using System.Net.Http;

namespace DeepSeekDesktop;

/// <summary>
/// 管理 DeepSeek Harness 本地 Web 服务器（与 Mac 版 ServerManager 逻辑一致）：
/// 1) 若目标端口已有服务 → 直接复用；
/// 2) 否则用内置 Node 运行时 + dsh 包拉起服务器，等待就绪。
/// </summary>
public sealed class ServerManager : IDisposable
{
    private Process? _serverProcess;
    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(2) };
    private readonly object _logLock = new();

    /// <summary>目标端口：环境变量 DSH_DESKTOP_PORT 优先，默认 3080。</summary>
    public int PreferredPort
    {
        get
        {
            var raw = Environment.GetEnvironmentVariable("DSH_DESKTOP_PORT");
            return int.TryParse(raw, out var p) && p is >= 0 and <= 65535 ? p : 3080;
        }
    }

    /// <summary>数据目录覆盖（默认使用用户真实 HOME 下的 ~/.dsh）。</summary>
    private string? HomeOverride
    {
        get
        {
            var v = Environment.GetEnvironmentVariable("DSH_DESKTOP_HOME");
            return string.IsNullOrEmpty(v) ? null : v;
        }
    }

    public string BaseUrl => $"http://127.0.0.1:{PreferredPort}";

    /// <summary>确保服务器就绪；超时抛出异常。</summary>
    public async Task EnsureServerAsync()
    {
        if (await IsServingAsync(PreferredPort)) return;

        SpawnServer(PreferredPort);

        var deadline = DateTime.UtcNow.AddSeconds(25);
        while (DateTime.UtcNow < deadline)
        {
            if (await IsServingAsync(PreferredPort)) return;
            if (_serverProcess is { HasExited: true }) break;
            await Task.Delay(300);
        }
        throw new InvalidOperationException("服务器启动超时");
    }

    private async Task<bool> IsServingAsync(int port)
    {
        try
        {
            using var resp = await _http.GetAsync($"http://127.0.0.1:{port}/");
            return resp.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    private void SpawnServer(int port)
    {
        var root = AppContext.BaseDirectory;
        var node = Path.Combine(root, "runtime", "node.exe");
        var bin = Path.Combine(root, "runtime", "bundle", "node_modules",
            "@deepseek-ai", "dsh", "lib", "bin.js");
        if (!File.Exists(node) || !File.Exists(bin))
        {
            throw new FileNotFoundException("内置运行时缺失（runtime/node.exe 或 dsh 包未找到）");
        }

        var psi = new ProcessStartInfo
        {
            FileName = node,
            WorkingDirectory = Path.Combine(root, "runtime", "bundle"),
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        psi.ArgumentList.Add(bin);
        psi.ArgumentList.Add("web");
        psi.ArgumentList.Add("--port");
        psi.ArgumentList.Add(port.ToString());
        psi.Environment["DSH_DESKTOP"] = "1";
        if (HomeOverride is not null)
        {
            psi.Environment["DSH_HOME"] = HomeOverride;
        }

        var logDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "DeepSeek");
        Directory.CreateDirectory(logDir);
        var logFile = Path.Combine(logDir, "server.log");

        _serverProcess = Process.Start(psi);
        if (_serverProcess != null)
        {
            _serverProcess.OutputDataReceived += (_, e) => AppendLog(logFile, e.Data);
            _serverProcess.ErrorDataReceived += (_, e) => AppendLog(logFile, e.Data);
            _serverProcess.BeginOutputReadLine();
            _serverProcess.BeginErrorReadLine();
        }
    }

    private void AppendLog(string file, string? line)
    {
        if (string.IsNullOrEmpty(line)) return;
        lock (_logLock)
        {
            File.AppendAllText(file, $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} {line}{Environment.NewLine}");
        }
    }

    /// <summary>退出时杀掉由本 App 拉起的整个进程树（Windows: Kill(true)）。</summary>
    public void Shutdown()
    {
        if (_serverProcess is { HasExited: false } p)
        {
            try { p.Kill(entireProcessTree: true); }
            catch { /* 进程可能已退出 */ }
            _serverProcess = null;
        }
    }

    public void Dispose() => Shutdown();
}
