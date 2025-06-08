import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  ListItemSecondaryAction,
  Avatar,
  IconButton,
  Button,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Chip,
  CircularProgress,
  Alert,
  Divider,
  Tooltip,
  FormControl,
  InputLabel,
} from '@mui/material';
import {
  PersonAdd,
  Delete,
  Email,
  ContentCopy,
  Close,
} from '@mui/icons-material';
import { useWorkspace } from '../contexts/workspace-context';
import { useAuth } from '../contexts/auth-context';

export function WorkspaceMembers() {
  const { user } = useAuth();
  const {
    currentWorkspace,
    members,
    invites,
    inviteMember,
    updateMemberRole,
    removeMember,
    cancelInvite,
    loading,
  } = useWorkspace();

  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member' | 'viewer'>('member');
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleInviteMember = async () => {
    if (!inviteEmail.trim()) {
      setError('Email is required');
      return;
    }

    setInviting(true);
    setError(null);

    try {
      await inviteMember({ email: inviteEmail.trim(), role: inviteRole });
      setInviteDialogOpen(false);
      setInviteEmail('');
      setInviteRole('member');
      setSuccessMessage('Invitation sent successfully');
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (error: any) {
      setError(error.message || 'Failed to send invitation');
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: 'admin' | 'member' | 'viewer') => {
    try {
      await updateMemberRole(userId, newRole);
    } catch (error: any) {
      setError(error.message || 'Failed to update role');
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (window.confirm('Are you sure you want to remove this member?')) {
      try {
        await removeMember(userId);
      } catch (error: any) {
        setError(error.message || 'Failed to remove member');
      }
    }
  };

  const handleCancelInvite = async (inviteId: string) => {
    try {
      await cancelInvite(inviteId);
    } catch (error: any) {
      setError(error.message || 'Failed to cancel invitation');
    }
  };

  const copyInviteLink = (token: string) => {
    const inviteUrl = `${window.location.origin}/invite/${token}`;
    navigator.clipboard.writeText(inviteUrl);
    setSuccessMessage('Invite link copied to clipboard');
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'owner':
        return 'error';
      case 'admin':
        return 'warning';
      case 'member':
        return 'primary';
      case 'viewer':
        return 'default';
      default:
        return 'default';
    }
  };

  const currentUserRole = members.find(m => m.email === user?.email)?.role;
  const canManageMembers = currentUserRole === 'owner' || currentUserRole === 'admin';

  if (!currentWorkspace) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="info">Please select a workspace to view members</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h5">Workspace Members</Typography>
        {canManageMembers && (
          <Button
            variant="contained"
            startIcon={<PersonAdd />}
            onClick={() => setInviteDialogOpen(true)}
          >
            Invite Member
          </Button>
        )}
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {successMessage && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccessMessage(null)}>
          {successMessage}
        </Alert>
      )}

      <Paper>
        <List>
          {members.map((member, index) => (
            <React.Fragment key={member.id}>
              {index > 0 && <Divider />}
              <ListItem>
                <ListItemAvatar>
                  <Avatar>{member.email[0].toUpperCase()}</Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={member.email}
                  secondary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                      <Chip
                        label={member.role}
                        size="small"
                        color={getRoleBadgeColor(member.role)}
                      />
                      <Typography variant="caption" color="text.secondary">
                        Joined {new Date(member.joinedAt).toLocaleDateString()}
                      </Typography>
                    </Box>
                  }
                />
                <ListItemSecondaryAction>
                  {canManageMembers && member.role !== 'owner' && member.email !== user?.email && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <FormControl size="small" sx={{ minWidth: 100 }}>
                        <Select
                          value={member.role}
                          onChange={(e) => handleRoleChange(member.userId, e.target.value as any)}
                          size="small"
                        >
                          <MenuItem value="admin">Admin</MenuItem>
                          <MenuItem value="member">Member</MenuItem>
                          <MenuItem value="viewer">Viewer</MenuItem>
                        </Select>
                      </FormControl>
                      <Tooltip title="Remove member">
                        <IconButton
                          edge="end"
                          onClick={() => handleRemoveMember(member.userId)}
                          color="error"
                        >
                          <Delete />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  )}
                </ListItemSecondaryAction>
              </ListItem>
            </React.Fragment>
          ))}
        </List>
      </Paper>

      {invites.length > 0 && (
        <>
          <Typography variant="h6" sx={{ mt: 4, mb: 2 }}>
            Pending Invitations
          </Typography>
          <Paper>
            <List>
              {invites.map((invite, index) => (
                <React.Fragment key={invite.id}>
                  {index > 0 && <Divider />}
                  <ListItem>
                    <ListItemAvatar>
                      <Avatar>
                        <Email />
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={invite.email}
                      secondary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                          <Chip
                            label={invite.role}
                            size="small"
                            color={getRoleBadgeColor(invite.role)}
                          />
                          <Typography variant="caption" color="text.secondary">
                            Expires {new Date(invite.expiresAt).toLocaleDateString()}
                          </Typography>
                        </Box>
                      }
                    />
                    <ListItemSecondaryAction>
                      {canManageMembers && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {invite.token && (
                            <Tooltip title="Copy invite link">
                              <IconButton
                                onClick={() => copyInviteLink(invite.token!)}
                              >
                                <ContentCopy />
                              </IconButton>
                            </Tooltip>
                          )}
                          <Tooltip title="Cancel invitation">
                            <IconButton
                              edge="end"
                              onClick={() => handleCancelInvite(invite.id)}
                              color="error"
                            >
                              <Close />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      )}
                    </ListItemSecondaryAction>
                  </ListItem>
                </React.Fragment>
              ))}
            </List>
          </Paper>
        </>
      )}

      {/* Invite Member Dialog */}
      <Dialog
        open={inviteDialogOpen}
        onClose={() => !inviting && setInviteDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Invite Member</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Email Address"
            type="email"
            fullWidth
            variant="outlined"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            disabled={inviting}
            sx={{ mb: 2 }}
          />
          <FormControl fullWidth variant="outlined">
            <InputLabel>Role</InputLabel>
            <Select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as any)}
              label="Role"
              disabled={inviting}
            >
              <MenuItem value="admin">Admin - Can manage workspace settings and members</MenuItem>
              <MenuItem value="member">Member - Can create and manage resources</MenuItem>
              <MenuItem value="viewer">Viewer - Read-only access</MenuItem>
            </Select>
          </FormControl>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
            An invitation email will be sent to the provided address.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInviteDialogOpen(false)} disabled={inviting}>
            Cancel
          </Button>
          <Button
            onClick={handleInviteMember}
            variant="contained"
            disabled={inviting || !inviteEmail.trim()}
          >
            {inviting ? <CircularProgress size={20} /> : 'Send Invitation'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}