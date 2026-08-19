$html = Get-Content -Raw claude_share.html
Write-Output "HTML length: $($html.Length)"
$regex = [regex]'<script[^>]*>(.*?)</script>'
$matches = $regex.Matches($html)
Write-Output "Matches count: $($matches.Count)"
foreach ($m in $matches) {
    Write-Output "=== SCRIPT ==="
    $val = $m.Groups[1].Value
    if ($val.Length -gt 200) {
        Write-Output $val.Substring(0, 200)
    } else {
        Write-Output $val
    }
}
