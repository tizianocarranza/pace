param([string]$PreviewDirectory = (Join-Path $PSScriptRoot 'animation-previews'))

# Compose the genuine GLB-import renders. No model or source image is modified.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$PreviewDirectory = [IO.Path]::GetFullPath($PreviewDirectory)
$manifest = Get-Content -Raw -LiteralPath (Join-Path $PreviewDirectory 'manifest.json') | ConvertFrom-Json
$background = [Drawing.ColorTranslator]::FromHtml('#F5F4F2')
$ink = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#292826'))
$muted = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#73716D'))
$titleFont = [Drawing.Font]::new('Segoe UI', 30, [Drawing.FontStyle]::Regular, [Drawing.GraphicsUnit]::Pixel)
$labelFont = [Drawing.Font]::new('Segoe UI', 20, [Drawing.FontStyle]::Regular, [Drawing.GraphicsUnit]::Pixel)
$smallFont = [Drawing.Font]::new('Segoe UI', 16, [Drawing.FontStyle]::Regular, [Drawing.GraphicsUnit]::Pixel)
$images = @{}

function New-Canvas([int]$Width, [int]$Height) {
    $bitmap = [Drawing.Bitmap]::new($Width, $Height, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $graphics.Clear($background)
    $graphics.CompositingQuality = [Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    return @{ Bitmap = $bitmap; Graphics = $graphics }
}

function Draw-Label($Canvas, [string]$Text, [single]$X, [single]$Y, $Font = $labelFont, $Brush = $ink) {
    $Canvas.Graphics.DrawString($Text, $Font, $Brush, $X, $Y)
}

function Draw-Frame($Canvas, [string]$File, [single]$X, [single]$Y, [single]$Size) {
    if (-not $images.ContainsKey($File)) {
        $images[$File] = [Drawing.Bitmap]::new((Join-Path $PreviewDirectory $File))
    }
    $Canvas.Graphics.DrawImage($images[$File], [Drawing.RectangleF]::new($X, $Y, $Size, $Size))
}

function Save-Canvas($Canvas, [string]$Name) {
    $Canvas.Bitmap.Save((Join-Path $PreviewDirectory $Name), [Drawing.Imaging.ImageFormat]::Png)
    Write-Output (Join-Path $PreviewDirectory $Name)
}

function Close-Canvas($Canvas) {
    $Canvas.Graphics.Dispose()
    $Canvas.Bitmap.Dispose()
}

try {
    # Full-size per-clip strips are available for inspecting small feet and eyes.
    foreach ($name in @('Idle', 'Run', 'Stumble')) {
        $clip = $manifest.clips.$name
        if ($null -eq $clip) { continue }
        $size = [int]$manifest.image_size
        $canvas = New-Canvas ($clip.frames.Count * $size + 80) ($size + 180)
        try {
            Draw-Label $canvas "PIP / $($name.ToUpperInvariant()) / $($clip.duration)s" 40 30 $titleFont
            Draw-Label $canvas 'Rendered from the exported GLB / fixed orthographic camera' 40 76 $smallFont $muted
            for ($i = 0; $i -lt $clip.frames.Count; $i++) {
                $frame = $clip.frames[$i]
                Draw-Frame $canvas $frame.file (40 + $i * $size) 105 $size
                Draw-Label $canvas ('{0:0.000}s' -f $frame.time) (55 + $i * $size) ($size + 120) $smallFont $muted
            }
            Save-Canvas $canvas "pip-$($name.ToLowerInvariant())-strip.png"
        } finally { Close-Canvas $canvas }
    }

    $canvas = New-Canvas 2000 1770
    try {
        Draw-Label $canvas 'PIP / EXPORTED ANIMATION AND MORPH REVIEW' 50 35 $titleFont
        Draw-Label $canvas 'Actual GLB import renders / identical camera, scale and neutral lighting / no environmental geometry' 50 84 $smallFont $muted
        $row = 140
        foreach ($name in @('Idle', 'Run', 'Stumble')) {
            $clip = $manifest.clips.$name
            if ($null -eq $clip) { continue }
            $loopLabel = if ($clip.loop) { 'seamless loop / duplicate end omitted' } else { 'one shot / recovered end pose included' }
            Draw-Label $canvas "$($name.ToUpperInvariant()) / $($clip.duration)s / $loopLabel" 50 $row
            for ($i = 0; $i -lt $clip.frames.Count; $i++) {
                $frame = $clip.frames[$i]
                Draw-Frame $canvas $frame.file (40 + 240 * $i) ($row + 30) 240
                Draw-Label $canvas ('{0:0.000}s' -f $frame.time) (55 + 240 * $i) ($row + 275) $smallFont $muted
            }
            $row += 330
        }
        Draw-Label $canvas 'BODY MORPHS / neutral pose / independently controlled' 50 $row
        for ($i = 0; $i -lt $manifest.morphs.Count; $i++) {
            $morph = $manifest.morphs[$i]
            Draw-Frame $canvas $morph.file (40 + 480 * $i) ($row + 35) 480
            Draw-Label $canvas "$($morph.name) / Squash $($morph.Squash), Stretch $($morph.Stretch)" (55 + 480 * $i) ($row + 515) $smallFont
        }
        Draw-Label $canvas 'Motion playback at 0.6x, 1.0x and 2.0x: open animation-previews/index.html. All presentation remains outside the GLB.' 50 1715 $smallFont $muted
        Save-Canvas $canvas 'pip-animation-review.png'
    } finally { Close-Canvas $canvas }
} finally {
    foreach ($loaded in $images.Values) { $loaded.Dispose() }
    $titleFont.Dispose()
    $labelFont.Dispose()
    $smallFont.Dispose()
    $ink.Dispose()
    $muted.Dispose()
}
