// Script PowerShell embutido: o PowerShell não lê arquivos de dentro do app.asar.
// String.raw não aceita crase; ela entra por interpolação.
const BT = "`";

/** Script PowerShell da ponte com as sessões de mídia do Windows. */
export const MEDIA_SESSION_SCRIPT = String.raw`# Ponte com as sessões de mídia do Windows (GlobalSystemMediaTransportControls).
# Lê um comando por linha no stdin e responde uma linha JSON no stdout.
# Comandos (lista fechada): state | play | pause | toggle | next | previous | seek <ms>
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime

$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation${BT}1'
})[0]
function Await($op, [Type]$type) {
    $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
    [void]$task.Wait(5000)
    $task.Result
}

[void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$manager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

function Get-Session {
    $sessions = @($manager.GetSessions())
    $spotify = $sessions | Where-Object { $_.SourceAppUserModelId -like '*Spotify*' } | Select-Object -First 1
    if ($spotify) { return $spotify }
    return $manager.GetCurrentSession()
}

function Get-State {
    $s = Get-Session
    if (-not $s) { return @{ active = $false } }
    $props = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
    $info = $s.GetPlaybackInfo()
    $tl = $s.GetTimelineProperties()
    $playing = [string]$info.PlaybackStatus -eq 'Playing'
    $position = $tl.Position.TotalMilliseconds
    if ($playing -and $tl.LastUpdatedTime.Year -gt 2000) {
        $position += ([DateTimeOffset]::Now - $tl.LastUpdatedTime).TotalMilliseconds
    }
    $duration = ($tl.EndTime - $tl.StartTime).TotalMilliseconds
    if ($duration -gt 0 -and $position -gt $duration) { $position = $duration }
    $key = "$($props.Title)|$($props.Artist)|$($props.AlbumTitle)"
    $result = @{
        active     = $true
        app        = [string]$s.SourceAppUserModelId
        title      = [string]$props.Title
        artist     = [string]$props.Artist
        album      = [string]$props.AlbumTitle
        isPlaying  = $playing
        positionMs = [math]::Max(0, [math]::Round($position))
        durationMs = [math]::Max(0, [math]::Round($duration))
        canNext    = [bool]$info.Controls.IsNextEnabled
        canPrev    = [bool]$info.Controls.IsPreviousEnabled
        canSeek    = [bool]$info.Controls.IsPlaybackPositionEnabled
        trackKey   = $key
    }
    return $result
}

while ($true) {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line) { break }
    $parts = $line.Trim().Split(' ')
    try {
        $s = $null
        if ($parts[0] -ne 'state') { $s = Get-Session }
        switch ($parts[0]) {
            'state' { $out = Get-State }
            'play' { $out = @{ ok = [bool](Await ($s.TryPlayAsync()) ([bool])) } }
            'pause' { $out = @{ ok = [bool](Await ($s.TryPauseAsync()) ([bool])) } }
            'toggle' { $out = @{ ok = [bool](Await ($s.TryTogglePlayPauseAsync()) ([bool])) } }
            'next' { $out = @{ ok = [bool](Await ($s.TrySkipNextAsync()) ([bool])) } }
            'previous' { $out = @{ ok = [bool](Await ($s.TrySkipPreviousAsync()) ([bool])) } }
            'seek' {
                $ticks = [int64]([int64]$parts[1] * 10000)
                $out = @{ ok = [bool](Await ($s.TryChangePlaybackPositionAsync($ticks)) ([bool])) }
            }
            default { $out = @{ error = 'comando desconhecido' } }
        }
    } catch {
        $out = @{ error = $_.Exception.Message }
    }
    [Console]::Out.WriteLine(($out | ConvertTo-Json -Compress -Depth 3))
    [Console]::Out.Flush()
}
`;
