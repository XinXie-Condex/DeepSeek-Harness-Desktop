using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;

namespace DeepSeekDesktop;

/// <summary>
/// 启动动画窗口（约 5 秒）：鲸鱼淡入 → 两行标题字母逐个弹入 → by Condex。
/// 与 Mac 版动画效果一致；鲸鱼静止不跳。
/// </summary>
public partial class SplashWindow : Window
{
    private const string Line1Text = "DeepSeek Harness";
    private const string Line2Text = "for Windows";

    private readonly List<TextBlock> _line1Blocks = new();
    private readonly List<TextBlock> _line2Blocks = new();
    private readonly System.Windows.Threading.DispatcherTimer _letterTimer = new();
    private int _letterIndex;

    public SplashWindow()
    {
        InitializeComponent();

        BuildLetterLine(Line1Panel, Line1Text, 30, FontWeights.Bold, Colors.Black, _line1Blocks);
        BuildLetterLine(Line2Panel, Line2Text, 20, FontWeights.SemiBold, Color.FromRgb(0x40, 0x40, 0x40), _line2Blocks);

        Loaded += OnLoaded;
    }

    private void BuildLetterLine(StackPanel panel, string text, double size,
        FontWeight weight, Color color, List<TextBlock> blocks)
    {
        foreach (var ch in text)
        {
            var tb = new TextBlock
            {
                Text = ch.ToString(),
                FontSize = size,
                FontWeight = weight,
                Foreground = new SolidColorBrush(color),
                Opacity = 0,
            };
            panel.Children.Add(tb);
            blocks.Add(tb);
        }
    }

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        // 1) 鲸鱼优雅淡入（0.15s 起，0.5s）
        var whaleFade = new DoubleAnimation(0, 1, TimeSpan.FromSeconds(0.5))
        { BeginTime = TimeSpan.FromSeconds(0.15) };
        var whaleScale = new DoubleAnimation(0.92, 1.0, TimeSpan.FromSeconds(0.5))
        { BeginTime = TimeSpan.FromSeconds(0.15) };
        WhaleImage.BeginAnimation(OpacityProperty, whaleFade);
        WhaleScale.BeginAnimation(ScaleTransform.ScaleXProperty, whaleScale);
        WhaleScale.BeginAnimation(ScaleTransform.ScaleYProperty, whaleScale);

        // 2) 字母逐个弹入（0.3s 起，每 0.07s 一个）
        _letterTimer.Interval = TimeSpan.FromMilliseconds(70);
        _letterTimer.Tick += (_, _) => ShowNextLetter();
        Dispatcher.BeginInvoke(() => _letterTimer.Start(), System.Windows.Threading.DispatcherPriority.Loaded,
            new object[] { });

        // 3) by Condex 3.2s 浮现（总时长约 5 秒由 App 控制切换）
        var authorFade = new DoubleAnimation(0, 1, TimeSpan.FromSeconds(0.4))
        { BeginTime = TimeSpan.FromSeconds(3.2) };
        AuthorPanel.BeginAnimation(OpacityProperty, authorFade);
    }

    private void ShowNextLetter()
    {
        // 先播第一行，第二行延迟 0.5s（约 7 个字母后）
        var delayOffset = _letterIndex >= _line1Blocks.Count ? 7 : 0;
        var block = _letterIndex < _line1Blocks.Count
            ? _line1Blocks[_letterIndex]
            : _line2Blocks[_letterIndex - _line1Blocks.Count];

        var fade = new DoubleAnimation(0, 1, TimeSpan.FromMilliseconds(200))
        { BeginTime = TimeSpan.FromMilliseconds(delayOffset * 70) };
        block.BeginAnimation(OpacityProperty, fade);

        _letterIndex++;
        if (_letterIndex >= _line1Blocks.Count + _line2Blocks.Count)
        {
            _letterTimer.Stop();
        }
    }
}
