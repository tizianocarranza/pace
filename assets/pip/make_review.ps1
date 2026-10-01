param(
    [string]$PreviewDirectory = (Join-Path $PSScriptRoot 'previews'),
    [string]$ReferencePath = (Join-Path $PSScriptRoot '../../public/references/pip-character-reference.png')
)

# This script only composites existing Blender renders. It never changes the model,
# reference sheet, source render pixels, or source render orientation.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
if (-not ('PipReview.Alpha' -as [type])) {
    Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
namespace PipReview {
    public static class Alpha {
        public static Rectangle Bounds(Bitmap bitmap) {
            Rectangle full = new Rectangle(0, 0, bitmap.Width, bitmap.Height);
            BitmapData data = bitmap.LockBits(full, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            try {
                int left = bitmap.Width, top = bitmap.Height, right = -1, bottom = -1;
                byte[] row = new byte[Math.Abs(data.Stride)];
                for (int y = 0; y < bitmap.Height; y++) {
                    Marshal.Copy(IntPtr.Add(data.Scan0, y * data.Stride), row, 0, row.Length);
                    for (int x = 0; x < bitmap.Width; x++) {
                        if (row[x * 4 + 3] < 16) continue;
                        left = Math.Min(left, x); right = Math.Max(right, x);
                        top = Math.Min(top, y); bottom = Math.Max(bottom, y);
                    }
                }
                if (right < left) throw new InvalidOperationException("Render has no visible pixels.");
                return Rectangle.FromLTRB(left, top, right + 1, bottom + 1);
            } finally { bitmap.UnlockBits(data); }
        }
    }
}
'@
}

$PreviewDirectory = [IO.Path]::GetFullPath($PreviewDirectory)
$ReferencePath = [IO.Path]::GetFullPath($ReferencePath)
$background = [Drawing.ColorTranslator]::FromHtml('#F5F4F2')
$ink = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#292826'))
$muted = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#73716D'))
$titleFont = [Drawing.Font]::new('Segoe UI', 30, [Drawing.FontStyle]::Regular, [Drawing.GraphicsUnit]::Pixel)
$labelFont = [Drawing.Font]::new('Segoe UI', 19, [Drawing.FontStyle]::Regular, [Drawing.GraphicsUnit]::Pixel)
$smallFont = [Drawing.Font]::new('Segoe UI', 16, [Drawing.FontStyle]::Regular, [Drawing.GraphicsUnit]::Pixel)
$images = @{}
$reference = $null

function New-Canvas([int]$Width, [int]$Height) {
    $bitmap = [Drawing.Bitmap]::new($Width, $Height, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $graphics.Clear($background)
    $graphics.CompositingMode = [Drawing.Drawing2D.CompositingMode]::SourceOver
    $graphics.CompositingQuality = [Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    return @{ Bitmap = $bitmap; Graphics = $graphics }
}

function Save-Canvas($Canvas, [string]$FileName) {
    $destination = Join-Path $PreviewDirectory $FileName
    $Canvas.Bitmap.Save($destination, [Drawing.Imaging.ImageFormat]::Png)
    Write-Output $destination
}

function Close-Canvas($Canvas) {
    if ($null -ne $Canvas) { $Canvas.Graphics.Dispose(); $Canvas.Bitmap.Dispose() }
}

function Write-Label($Graphics, [string]$Text, [single]$X, [single]$Y, $Font = $labelFont, $Brush = $ink) {
    $Graphics.DrawString($Text, $Font, $Brush, $X, $Y)
}

function Draw-Crop($Graphics, $Source, [Drawing.RectangleF]$Destination, [Drawing.RectangleF]$Crop) {
    $Graphics.DrawImage($Source, $Destination, $Crop, [Drawing.GraphicsUnit]::Pixel)
}

try {
    foreach ($view in @('side', 'front', 'three-quarter')) {
        $sourcePath = Join-Path $PreviewDirectory "pip-$view.png"
        if (-not (Test-Path -LiteralPath $sourcePath)) { throw "Missing Blender preview: $sourcePath" }
        $images[$view] = [Drawing.Bitmap]::new($sourcePath)
        $canvas = New-Canvas $images[$view].Width $images[$view].Height
        try {
            $canvas.Graphics.DrawImageUnscaled($images[$view], 0, 0)
            Save-Canvas $canvas "pip-$view-neutral.png"
        } finally { Close-Canvas $canvas }
    }

    $canvas = New-Canvas 1800 810
    try {
        Write-Label $canvas.Graphics 'PIP / STATIC MODEL' 65 48 $titleFont
        Write-Label $canvas.Graphics 'Phase 1 / Revision 02 - orthographic silhouette review' 65 99 $smallFont $muted
        $views = @('side', 'front', 'three-quarter')
        $labels = @('01 / SIDE', '02 / FRONT', '03 / THREE-QUARTER')
        for ($i = 0; $i -lt $views.Count; $i++) {
            $x = 30 + $i * 580
            $source = $images[$views[$i]]
            $destination = [Drawing.RectangleF]::new($x, 160, 560, 560)
            Draw-Crop $canvas.Graphics $source $destination ([Drawing.RectangleF]::new(0, 0, $source.Width, $source.Height))
            Write-Label $canvas.Graphics $labels[$i] ($x + 35) 707 $labelFont
        }
        Write-Label $canvas.Graphics 'Neutral studio lighting / warm-white matte body / no environment geometry' 65 762 $smallFont $muted
        Save-Canvas $canvas 'pip-review.png'
    } finally { Close-Canvas $canvas }

    $reference = [Drawing.Bitmap]::new($ReferencePath)
    if ($reference.Width -ne 1536 -or $reference.Height -ne 1024) {
        throw 'The reference crops require the canonical 1536 x 1024 sheet.'
    }
    $canvas = New-Canvas 1800 1220
    try {
        Write-Label $canvas.Graphics 'PIP / REFERENCE COMPARISON' 65 48 $titleFont
        Write-Label $canvas.Graphics 'Revision 02 / Canonical IDLE and static model at equal silhouette height, including feet' 65 99 $smallFont $muted
        Write-Label $canvas.Graphics 'CANONICAL IDLE' 275 163 $labelFont
        Write-Label $canvas.Graphics 'STATIC THREE-QUARTER' 1115 163 $labelFont

        # IDLE's visible silhouette spans approximately y=237..339 in the sheet.
        # Its original presentation shadow remains visible only inside this source crop.
        $idleScale = 3.4
        $idleLeft = 260
        $idleTop = 205
        Draw-Crop $canvas.Graphics $reference ([Drawing.RectangleF]::new($idleLeft, $idleTop, 139 * $idleScale, 121 * $idleScale)) ([Drawing.RectangleF]::new(80, 226, 139, 121))

        $source = $images['three-quarter']
        $bounds = [PipReview.Alpha]::Bounds($source)
        $targetHeight = 103 * $idleScale
        $targetWidth = $bounds.Width * $targetHeight / $bounds.Height
        $targetTop = $idleTop + 11 * $idleScale
        $targetLeft = 1310 - $targetWidth / 2
        Draw-Crop $canvas.Graphics $source ([Drawing.RectangleF]::new($targetLeft, $targetTop, $targetWidth, $targetHeight)) ([Drawing.RectangleF]$bounds)

        Write-Label $canvas.Graphics 'Original sheet crop, enlarged without repainting' 275 636 $smallFont $muted
        Write-Label $canvas.Graphics 'Genuine Blender render, no ground or shadow' 1115 636 $smallFont $muted
        Write-Label $canvas.Graphics 'CANONICAL DETAIL CROPS' 65 720 $labelFont
        $details = @(
            @{ Label = 'FRONT / EYES'; X = 923; Y = 774; W = 171; H = 119 },
            @{ Label = 'SIDE / BODY VOLUME'; X = 1115; Y = 774; W = 172; H = 119 },
            @{ Label = 'FOOT / BOTTOM'; X = 1308; Y = 774; W = 173; H = 119 }
        )
        for ($i = 0; $i -lt $details.Count; $i++) {
            $detail = $details[$i]
            $x = 65 + $i * 580
            $width = 490
            $height = $detail.H * $width / $detail.W
            Draw-Crop $canvas.Graphics $reference ([Drawing.RectangleF]::new($x, 766, $width, $height)) ([Drawing.RectangleF]::new($detail.X, $detail.Y, $detail.W, $detail.H))
            Write-Label $canvas.Graphics $detail.Label $x 1127 $smallFont
        }
        Write-Label $canvas.Graphics 'Reference: public/references/pip-character-reference.png / Presentation elements belong to the source sheet only.' 65 1182 $smallFont $muted
        Save-Canvas $canvas 'pip-reference-comparison.png'
    } finally { Close-Canvas $canvas }
} finally {
    foreach ($loaded in $images.Values) { $loaded.Dispose() }
    if ($null -ne $reference) { $reference.Dispose() }
    $titleFont.Dispose(); $labelFont.Dispose(); $smallFont.Dispose()
    $ink.Dispose(); $muted.Dispose()
}
