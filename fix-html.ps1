$content = Get-Content index.html -Raw

# Step 1: Add closing </main> and </div> after the first assure-bien closes, before the wizard modal
# The pattern is: </section> (closes assure-bien) followed by <div class="modal-overlay" id="clientWizardModal">
$pattern = '(?s)(        </section>\s*\n    <div class="modal-overlay" id="clientWizardModal")'
$replacement = '      </main>
    </div>

    <div class="modal-overlay" id="clientWizardModal"'
$content = $content -replace $pattern, $replacement

# Step 2: Remove the dangling duplicate content (second assure-bien + remaining views + modal + dangling closes)
$pattern2 = '(?s)\n        <!-- ====== VIEW: Espace Assuré — Mon Bien ====== -->\n        <section class="view-panel" id="view-assure-bien">.*$'
$content = $content -replace $pattern2, ''

Set-Content index.html $content -NoNewline
Write-Host "Done"
