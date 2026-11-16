#!/usr/bin/env python3
"""Filesystem fault tests; no Docker, network, or production access."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('cancel', Path(__file__).with_name('production-release-cancellation.py'))
cancel = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cancel)


class CancellationDurability(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='portal-cancel-test-')
        self.app = Path(self.temp.name) / 'app'
        self.state = self.app / '.release-state'
        self.candidate = 'a' * 40
        self.current = 'b' * 40
        self.source = self.app / '.releases' / self.candidate
        self.source.mkdir(parents=True, mode=0o700)
        self.source.parent.chmod(0o700)
        self.app.chmod(0o700)
        self.state.mkdir(mode=0o700)
        self.manifest = self.source / 'manifest.txt'
        self.manifest.write_text(f'candidate_commit={self.candidate}\nobserved_current_commit={self.current}\n')
        self.manifest.chmod(0o600)
        (self.source / 'source.txt').write_text('keep this exact evidence\n')
        self.sha = cancel.checksum(self.manifest.read_bytes())
        self.entry = self.state / 'cancellations' / self.sha
        (self.state / 'prepared').write_text(self.candidate + '\n')
        (self.state / 'prepared').chmod(0o600)
        self.addCleanup(self.temp.cleanup)

    def action(self, action, approval='approval'):
        if action == 'finish':
            self.action('untag-0', approval)
            self.action('untag-1', approval)
        with patch('sys.argv', ['cancel', action, str(self.app), self.candidate, self.sha, approval, '100']):
            cancel.main()

    def test_archive_and_finish_preserve_every_byte(self):
        before = cancel.inventory(self.source)
        self.action('begin')
        self.action('move')
        self.action('finish')
        self.assertEqual(before, cancel.inventory(self.entry / 'release'))
        self.assertFalse((self.state / 'prepared').exists())
        cancel.check_history(self.state / 'cancellations')

    def test_fsync_failure_after_rename_is_resumable(self):
        self.action('begin')
        real_sync = cancel.sync
        def fail_target(path):
            if path == self.entry / 'release':
                raise OSError('injected fsync failure')
            real_sync(path)
        with patch.object(cancel, 'sync', fail_target):
            with self.assertRaises(OSError):
                self.action('move')
        with self.assertRaises(ValueError):
            cancel.check_history(self.state / 'cancellations')
        self.action('move')
        self.action('finish')

    def test_failed_pointer_durability_keeps_intent_and_resumes(self):
        self.action('begin')
        self.action('move')
        self.action('untag-0'); self.action('untag-1')
        real_sync = cancel.sync
        def fail_state(path):
            if path == self.state and not (self.state / 'prepared').exists():
                raise OSError('fsync')
            real_sync(path)
        with patch.object(cancel, 'sync', fail_state):
            with self.assertRaises(OSError):
                self.action('finish')
        self.assertFalse((self.state / 'prepared').exists())
        self.assertFalse((self.entry / 'completed').exists())
        self.action('finish')

    def test_intent_publication_failure_never_moves_source(self):
        with patch.object(cancel.os, 'rename', side_effect=OSError('rename')):
            with self.assertRaises(OSError):
                self.action('begin')
        self.assertTrue(self.source.exists())
        self.assertTrue((self.state / 'prepared').exists())
        self.assertFalse(self.entry.exists())
        self.action('begin')

    def test_partial_completion_temp_is_rebuilt_from_intent(self):
        self.action('begin'); self.action('move')
        (self.entry / 'completed.tmp').write_text('partial')
        (self.entry / 'completed.tmp').chmod(0o600)
        self.action('finish')
        self.assertFalse((self.entry / 'completed.tmp').exists())
        cancel.check_history(self.state / 'cancellations')

    def test_visible_intent_repeats_failed_publication_barrier(self):
        real_sync = cancel.sync
        history = self.state / 'cancellations'
        def fail_history(path):
            if path == history:
                raise OSError('intent publication fsync')
            real_sync(path)
        with patch.object(cancel, 'sync', fail_history):
            with self.assertRaises(OSError):
                self.action('begin')
            self.assertTrue((self.entry / 'intent.json').exists())
            with self.assertRaises(OSError):
                self.action('move')
            self.assertTrue(self.source.exists())
        self.action('move')
        self.action('finish')

    def test_wrong_approval_cannot_resume(self):
        self.action('begin')
        with self.assertRaises(ValueError):
            self.action('move', 'different')
        self.assertTrue(self.source.exists())

    def test_changed_source_cannot_move(self):
        self.action('begin')
        (self.source / 'source.txt').write_text('changed')
        with self.assertRaises(ValueError):
            self.action('move')
        self.assertTrue(self.source.exists())

    def test_symlink_or_hardlink_cannot_be_archived(self):
        (self.source / 'link').symlink_to(self.manifest)
        with self.assertRaises(ValueError):
            self.action('begin')
        (self.source / 'link').unlink()
        os.link(self.manifest, self.source / 'hardlink')
        with self.assertRaises(ValueError):
            self.action('begin')

    def test_completed_corruption_blocks_ordinary_actions(self):
        self.action('begin'); self.action('move'); self.action('finish')
        (self.entry / 'release' / 'source.txt').write_text('changed')
        with self.assertRaises(ValueError):
            cancel.check_history(self.state / 'cancellations')

    def test_unknown_intent_fields_rejected(self):
        self.action('begin')
        value = json.loads((self.entry / 'intent.json').read_text())
        value['extra'] = True
        (self.entry / 'intent.json').write_bytes(cancel.encode(value))
        with self.assertRaises(ValueError):
            self.action('move')

    def test_bounds_precede_publication(self):
        with patch.object(cancel, 'MAX_ENTRIES', 1):
            with self.assertRaises(ValueError):
                self.action('begin')
        self.assertFalse(self.entry.exists())
        with patch.object(cancel, 'MAX_BYTES', 4):
            with self.assertRaises(ValueError):
                self.action('begin')
        self.assertFalse(self.entry.exists())

    def test_old_completed_approval_cannot_retire_new_prepared_pointer(self):
        self.action('begin'); self.action('move'); self.action('finish')
        (self.state / 'prepared').write_text(self.candidate + '\n')
        (self.state / 'prepared').chmod(0o600)
        with self.assertRaises(ValueError):
            self.action('verify')
        self.assertTrue((self.state / 'prepared').exists())


if __name__ == '__main__':
    unittest.main()
