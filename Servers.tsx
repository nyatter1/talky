import React, { useEffect, useRef, useState } from "react";
import { LocalVoiceRoom } from "./LocalVoiceRoom";

export interface TalkyServer {
  id: string;
  name: string;
  description: string;
  icon: string;
  banner: string;
  channels: ServerChannel[];
  roles: ServerRole[];
  roleAssignments: ServerRoleAssignments;
}

export interface ServerChannel {
  id: string;
  name: string;
  type: "text" | "voice";
}

export interface ServerRole {
  id: string;
  name: string;
  color: string;
}

export type ServerRoleAssignments = Record<string, string[]>;

export interface ServerMember {
  id: string;
  displayName: string;
  username: string;
  avatar: string;
  bio: string;
  pronouns?: string;
  isCurrentUser?: boolean;
  roleIds?: string[];
}

function RolePickerToggleIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      {open
        ? <path d="m4 4 8 8m0-8-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        : <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
    </svg>
  );
}

function RolePickerMark({ assigned }: { assigned: boolean }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      {assigned
        ? <path d="m3.25 8.25 3 3 6.5-6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        : <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
    </svg>
  );
}

const ROLE_COLOR_OPTIONS = [
  "#99aab5", "#1abc9c", "#2ecc71", "#3498db", "#9b59b6", "#e91e63",
  "#f1c40f", "#e67e22", "#e74c3c", "#607d8b", "#16a085", "#27ae60",
  "#2980b9", "#8e44ad", "#c2185b", "#d35400", "#c0392b", "#455a64",
];

function MemberRolePicker({
  member,
  roles,
  assignedRoleIds,
  onToggleRole,
}: {
  member: ServerMember;
  roles: ServerRole[];
  assignedRoleIds: string[];
  onToggleRole: (roleId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="server-role-picker-anchor">
      <button
        className="server-role-picker-trigger"
        type="button"
        aria-label={`${open ? "Close" : "Add"} roles for ${member.displayName}`}
        aria-expanded={open}
        title={roles.length ? "Add or remove roles" : "Create a role first"}
        disabled={!roles.length}
        onClick={() => setOpen(value => !value)}
      >
        <RolePickerToggleIcon open={open} />
      </button>
      {open && (
        <div className="server-role-picker-menu" role="group" aria-label={`Roles for ${member.displayName}`}>
          {roles.map(role => {
            const assigned = assignedRoleIds.includes(role.id);
            return (
              <button
                key={role.id}
                className={`server-role-picker-option${assigned ? " is-assigned" : ""}`}
                type="button"
                aria-pressed={assigned}
                onClick={() => { onToggleRole(role.id); setOpen(false); }}
              >
                <span className="server-role-dot" style={{ backgroundColor: role.color }} />
                <span className="server-role-picker-name">{role.name}</span>
                <span className="server-role-picker-mark"><RolePickerMark assigned={assigned} /></span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const readImageFile = (file: File): Promise<string> => new Promise((resolve, reject) => {
  if (!file.type.startsWith("image/")) {
    reject(new Error("Choose an image file."));
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    reject(new Error("Images must be 8 MB or smaller."));
    return;
  }
  const reader = new FileReader();
  reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read that image."));
  reader.onerror = () => reject(new Error("Could not read that image."));
  reader.readAsDataURL(file);
});

export function ServerRailItems({
  servers,
  selectedServerId,
  onSelectServer,
  onCreateServer,
}: {
  servers: TalkyServer[];
  selectedServerId: string | null;
  onSelectServer: (id: string) => void;
  onCreateServer: () => void;
}) {
  return (
    <>
      <div className="server-icons-list" aria-label="Your servers">
        {servers.map(server => (
          <button
            key={server.id}
            className={`server-rail-icon${selectedServerId === server.id ? " is-active" : ""}`}
            type="button"
            aria-label={server.name}
            aria-pressed={selectedServerId === server.id}
            title={server.name}
            onClick={() => onSelectServer(server.id)}
          >
            {server.icon ? <img src={server.icon} alt="" /> : <span>{server.name.trim().charAt(0).toUpperCase() || "✦"}</span>}
          </button>
        ))}
      </div>
      <button
        className="server-create-rail-button"
        type="button"
        aria-label="Create a server"
        title="Create a server"
        onClick={onCreateServer}
      >
        <span aria-hidden="true">+</span>
      </button>
    </>
  );
}

export function ServerWorkspace({
  server,
  servers,
  selectedServerId,
  members,
  channel,
  channelChat,
  menuOpen,
  onHome,
  onSelectServer,
  onCreateServer,
  onSelectChannel,
  onCreateChannel,
  onToggleMenu,
  onOpenSettings,
  onSelectMember,
  onHangUp,
}: {
  server: TalkyServer;
  servers: TalkyServer[];
  selectedServerId: string | null;
  members: ServerMember[];
  channel: ServerChannel;
  channelChat: React.ReactNode;
  menuOpen: boolean;
  onHome: () => void;
  onSelectServer: (id: string) => void;
  onCreateServer: () => void;
  onSelectChannel: (channelId: string) => void;
  onCreateChannel: (name: string, type: ServerChannel["type"]) => void;
  onToggleMenu: () => void;
  onOpenSettings: () => void;
  onSelectMember: (member: ServerMember) => void;
  onHangUp: () => void;
}) {
  const [channelDraftType, setChannelDraftType] = useState<ServerChannel["type"] | null>(null);
  const [channelNameDraft, setChannelNameDraft] = useState("");
  const getHighestRole = (member: ServerMember) =>
    server.roles.find(role => member.roleIds?.includes(role.id)) || null;
  const roleGroups = server.roles.map(role => ({
    role,
    members: members.filter(member => getHighestRole(member)?.id === role.id),
  })).filter(group => group.members.length > 0);
  const membersWithoutRole = members.filter(member => !getHighestRole(member));
  const currentUser = members.find(member => member.isCurrentUser) || members[0];

  const openChannelCreator = (type: ServerChannel["type"]) => {
    setChannelNameDraft("");
    setChannelDraftType(type);
  };

  const submitChannel = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!channelDraftType) return;
    const name = channelNameDraft.trim().toLowerCase()
      .replace(/[^a-z0-9 _-]/g, "")
      .replace(/[ _]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48);
    if (!name) return;
    onCreateChannel(name, channelDraftType);
    setChannelDraftType(null);
    setChannelNameDraft("");
  };

  return (
    <section className={`server-workspace${channel.type === "voice" ? " is-voice-channel" : ""}`} aria-label={`${server.name} server`}>
      <nav className="server-rail server-view-rail" aria-label="Servers">
        <button className="home-logo-button" type="button" aria-label="Direct Messages" title="Direct Messages" onClick={onHome}>
          <img src="https://i.postimg.cc/PPWj43yf/logo.png" alt="Talky" />
        </button>
        <div className="rail-divider" />
        <ServerRailItems
          servers={servers}
          selectedServerId={selectedServerId}
          onSelectServer={onSelectServer}
          onCreateServer={onCreateServer}
        />
      </nav>

      <aside className="server-channel-sidebar" aria-label="Server channels">
        <div className="server-sidebar-header">
          <div className="server-name-menu-anchor">
            <button
              className="server-name-button"
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={onToggleMenu}
            >
              <span>{server.name}</span>
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
            </button>
            {menuOpen && (
              <div className="server-name-menu" role="menu">
                <button type="button" role="menuitem" onClick={onOpenSettings}>Server Settings</button>
              </div>
            )}
          </div>
        </div>
        <div className="server-sidebar-banner" aria-label={`${server.name} banner`}>
          {server.banner ? <img src={server.banner} alt="" /> : <div className="server-sidebar-banner-empty" />}
        </div>
        <div className="server-channel-section">
          {(["text", "voice"] as const).map(type => {
            const typeChannels = server.channels.filter(serverChannel => serverChannel.type === type);
            return (
              <div className="server-channel-group" key={type}>
                <div className="server-channel-heading">
                  <span>{type === "text" ? "TEXT CHANNELS" : "VOICE CHANNELS"}</span>
                  <button
                    className="server-channel-create-button"
                    type="button"
                    aria-label={`Create ${type} channel`}
                    title={`Create ${type} channel`}
                    onClick={() => openChannelCreator(type)}
                  >+</button>
                </div>
                <div className="server-channel-list">
                  {typeChannels.map(serverChannel => (
                    <button
                      key={serverChannel.id}
                      className={`server-channel-button${channel.id === serverChannel.id ? " is-active" : ""}`}
                      type="button"
                      aria-current={channel.id === serverChannel.id ? "page" : undefined}
                      onClick={() => onSelectChannel(serverChannel.id)}
                    >
                      {serverChannel.type === "text" ? (
                        <span className="server-channel-hash" aria-hidden="true">#</span>
                      ) : (
                        <svg className="server-channel-voice-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M4 9v6h4l5 4V5L8 9H4Z" />
                          <path d="M16 9a5 5 0 0 1 0 6M18.5 6.5a8.5 8.5 0 0 1 0 11" />
                        </svg>
                      )}
                      <span>{serverChannel.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      {channel.type === "text" ? (
        <main className="server-channel-content" aria-label={`#${channel.name}`}>
          <header className="server-channel-header">
            <span className="server-channel-header-hash" aria-hidden="true">#</span>
            <h2>{channel.name}</h2>
          </header>
          {channelChat}
        </main>
      ) : (
        <main className="server-channel-content server-voice-content" aria-label={`Voice channel ${channel.name}`}>
          <LocalVoiceRoom
            channelName={channel.name}
            displayName={currentUser?.displayName || "You"}
            username={currentUser?.username || "you"}
            avatar={currentUser?.avatar || ""}
            chatPanel={channelChat}
            onHangUp={onHangUp}
          />
        </main>
      )}

      {channel.type === "text" && (
        <aside className="server-role-roster" aria-label="Server members by role">
          {roleGroups.map(({ role, members: roleMembers }) => (
            <section className="server-role-roster-group" key={role.id}>
              <h2 className="server-role-roster-heading">
                <span>{role.name}</span><span className="server-role-roster-count">{roleMembers.length}</span>
              </h2>
              <div className="server-role-roster-list">
                {roleMembers.map(member => (
                  <div className="server-role-roster-row" key={member.id}>
                    <button className="server-role-roster-user" type="button" aria-label={`View ${member.displayName}'s profile`} onClick={() => onSelectMember(member)}>
                      <span className="server-role-roster-avatar">
                        {member.avatar ? <img src={member.avatar} alt="" /> : <span>{member.displayName.trim().charAt(0).toUpperCase() || "?"}</span>}
                      </span>
                      <span className="server-role-roster-name" style={{ color: role.color }}>{member.username}</span>
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ))}
          {membersWithoutRole.length > 0 && (
            <section className="server-role-roster-group" key="members-without-role">
              <h2 className="server-role-roster-heading"><span>Members</span><span className="server-role-roster-count">{membersWithoutRole.length}</span></h2>
              <div className="server-role-roster-list">
                {membersWithoutRole.map(member => (
                  <div className="server-role-roster-row" key={member.id}>
                    <button className="server-role-roster-user" type="button" aria-label={`View ${member.displayName}'s profile`} onClick={() => onSelectMember(member)}>
                      <span className="server-role-roster-avatar">
                        {member.avatar ? <img src={member.avatar} alt="" /> : <span>{member.displayName.trim().charAt(0).toUpperCase() || "?"}</span>}
                      </span>
                      <span className="server-role-roster-name">{member.username}</span>
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
          {!members.length && <div className="server-role-roster-empty">No members yet.</div>}
        </aside>
      )}

      {channelDraftType && (
        <div className="server-channel-create-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setChannelDraftType(null); }}>
          <form className="server-channel-create-dialog" role="dialog" aria-modal="true" aria-labelledby="server-channel-create-title" onSubmit={submitChannel}>
            <h2 id="server-channel-create-title">Create a {channelDraftType} channel</h2>
            <label className="server-form-label" htmlFor="server-channel-create-name">CHANNEL NAME</label>
            <input
              id="server-channel-create-name"
              className="server-form-input"
              type="text"
              autoComplete="off"
              autoFocus
              maxLength={48}
              placeholder={channelDraftType === "text" ? "new-text-channel" : "new-voice-channel"}
              value={channelNameDraft}
              onChange={event => setChannelNameDraft(event.target.value)}
            />
            <div className="server-channel-create-actions">
              <button className="server-text-button" type="button" onClick={() => setChannelDraftType(null)}>Cancel</button>
              <button className="server-primary-button" type="submit" disabled={!channelNameDraft.trim()}>Create Channel</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

export function ServerMemberCard({ member, roles, assignedRoleIds, onToggleRole, onClose }: {
  member: ServerMember;
  roles: ServerRole[];
  assignedRoleIds: string[];
  onToggleRole: (roleId: string) => void;
  onClose: () => void;
}) {
  const assignedRoles = roles.filter(role => assignedRoleIds.includes(role.id));
  return (
    <div className="server-member-card-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <article className="server-member-card" role="dialog" aria-modal="true" aria-label={`${member.displayName}'s profile`}>
        <div className="server-member-card-banner" />
        <button className="server-member-card-close" type="button" aria-label="Close profile" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
        <div className="server-member-card-body">
          <div className="server-member-card-avatar">
            {member.avatar ? <img src={member.avatar} alt="" /> : <span>{member.displayName.trim().charAt(0).toUpperCase() || "?"}</span>}
            <span className="server-member-online-dot" />
          </div>
          <div className="server-member-card-name">{member.displayName}</div>
          <div className="server-member-card-handle">@{member.username}</div>
          {member.pronouns && <div className="server-member-card-pronouns">{member.pronouns}</div>}
          <div className="server-member-card-roles">
            <div className="server-member-card-label">ROLES</div>
            <div className="server-member-card-role-list">
              {assignedRoles.length ? assignedRoles.map(role => (
                <span className="server-role-chip" key={role.id}>
                  <span className="server-role-dot" style={{ backgroundColor: role.color }} />
                  {role.name}
                </span>
              )) : <span className="server-role-empty">No roles assigned</span>}
              <MemberRolePicker
                member={member}
                roles={roles}
                assignedRoleIds={assignedRoleIds}
                onToggleRole={onToggleRole}
              />
            </div>
          </div>
          <div className="server-member-card-divider" />
          <div className="server-member-card-label">ABOUT ME</div>
          <p>{member.bio || "This user hasn't added an about me yet."}</p>
        </div>
      </article>
    </div>
  );
}

export function CreateServerModal({
  isOpen,
  onClose,
  onCreate,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, icon: string) => void;
}) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [error, setError] = useState("");
  const iconInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName("");
      setIcon("");
      setError("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleIconFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    try {
      setIcon(await readImageFile(file));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read that image.");
    }
  };

  return (
    <div className="server-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="server-modal" role="dialog" aria-modal="true" aria-labelledby="create-server-title">
        <button className="server-modal-close" type="button" aria-label="Close" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
        <div className="server-modal-kicker">YOUR COMMUNITY, YOUR SPACE</div>
        <h2 id="create-server-title">Create a Server</h2>
        <p className="server-modal-intro">Give your new server a name and an icon. You can change these later.</p>
        <form onSubmit={event => { event.preventDefault(); if (name.trim()) onCreate(name.trim(), icon); }}>
          <label className="server-form-label" htmlFor="create-server-name">SERVER NAME</label>
          <input
            id="create-server-name"
            className="server-form-input"
            type="text"
            maxLength={64}
            autoComplete="off"
            placeholder="My Server"
            value={name}
            onChange={event => setName(event.target.value)}
          />
          <div className="server-form-label server-icon-label">SERVER ICON</div>
          <div className="server-upload-row">
            <span className="server-upload-avatar">
              {icon ? <img src={icon} alt="Server icon preview" /> : <span>{name.trim().charAt(0).toUpperCase() || "✦"}</span>}
            </span>
            <button className="server-secondary-button" type="button" onClick={() => iconInputRef.current?.click()}>Upload Server Icon</button>
            {icon && <button className="server-text-button" type="button" onClick={() => setIcon("")}>Remove</button>}
            <input ref={iconInputRef} type="file" accept="image/*" aria-label="Create server icon" hidden onChange={handleIconFile} />
          </div>
          <div className="server-upload-hint">PNG, JPG, GIF or WEBP · up to 8 MB</div>
          {error && <div className="server-form-error" role="alert">{error}</div>}
          <div className="server-modal-actions">
            <button className="server-text-button" type="button" onClick={onClose}>Cancel</button>
            <button className="server-primary-button" type="submit" disabled={!name.trim()}>Create</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ServerRolesSection({
  server,
  members,
  onSaveRoles,
}: {
  server: TalkyServer;
  members: ServerMember[];
  onSaveRoles: (roles: ServerRole[]) => void;
}) {
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [roleDraft, setRoleDraft] = useState<ServerRole | null>(null);
  const [isNewRole, setIsNewRole] = useState(false);
  const [roleError, setRoleError] = useState("");
  const [draggedRoleId, setDraggedRoleId] = useState<string | null>(null);

  const assignments = server.roleAssignments || {};

  const createRole = () => {
    const role = {
      id: `role-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: "",
      color: ROLE_COLOR_OPTIONS[0],
    };
    setSelectedRoleId(role.id);
    setRoleDraft(role);
    setIsNewRole(true);
    setRoleError("");
  };

  const selectRole = (role: ServerRole) => {
    setSelectedRoleId(role.id);
    setRoleDraft({ ...role });
    setIsNewRole(false);
    setRoleError("");
  };

  const saveRole = () => {
    if (!roleDraft?.name.trim()) {
      setRoleError("Enter a role name before saving.");
      return;
    }
    const savedRole = { ...roleDraft, name: roleDraft.name.trim().slice(0, 32) };
    const nextRoles = isNewRole
      ? [...server.roles, savedRole]
      : server.roles.map(role => role.id === savedRole.id ? savedRole : role);
    onSaveRoles(nextRoles);
    setRoleDraft(savedRole);
    setSelectedRoleId(savedRole.id);
    setIsNewRole(false);
    setRoleError("");
  };

  const reorderRoles = (sourceId: string, targetId: string) => {
    if (!sourceId || sourceId === targetId) return;
    const sourceIndex = server.roles.findIndex(role => role.id === sourceId);
    const targetIndex = server.roles.findIndex(role => role.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const nextRoles = [...server.roles];
    const [movedRole] = nextRoles.splice(sourceIndex, 1);
    nextRoles.splice(targetIndex, 0, movedRole);
    onSaveRoles(nextRoles);
  };

  return (
    <div className="server-roles-layout">
      <aside className="server-roles-list-panel" aria-label="Roles in this server">
        <div className="server-roles-list-header">
          <div>
            <h2>Roles</h2>
            <p>Drag to change hierarchy.</p>
          </div>
          <button className="server-role-create-button" type="button" onClick={createRole}>Create Role</button>
        </div>
        <div className="server-role-list" role="list" aria-label="Role hierarchy">
          {server.roles.map(role => {
            const count = members.filter(member => (assignments[member.id] || []).includes(role.id)).length;
            return (
              <div
                key={role.id}
                className={`server-role-list-row${selectedRoleId === role.id ? " is-selected" : ""}`}
                role="listitem"
                draggable
                onDragStart={event => {
                  setDraggedRoleId(role.id);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", role.id);
                }}
                onDragOver={event => event.preventDefault()}
                onDrop={event => {
                  event.preventDefault();
                  reorderRoles(event.dataTransfer.getData("text/plain") || draggedRoleId || "", role.id);
                  setDraggedRoleId(null);
                }}
                onDragEnd={() => setDraggedRoleId(null)}
              >
                <button
                  className="server-role-list-select"
                  type="button"
                  aria-current={selectedRoleId === role.id ? "true" : undefined}
                  onClick={() => selectRole(role)}
                >
                  <span className="server-role-dot" style={{ backgroundColor: role.color }} />
                  <span className="server-role-list-name">{role.name}</span>
                  <span className="server-role-member-count">{count}</span>
                </button>
              </div>
            );
          })}
          {!server.roles.length && <div className="server-role-list-empty">No roles yet.</div>}
        </div>
      </aside>

      <section className="server-role-editor-panel" aria-label="Role editor">
        {!roleDraft ? (
          <div className="server-role-editor-empty">
            <h2>Roles</h2>
            <p>Create a role, choose its color, and set its position in the hierarchy.</p>
            {!server.roles.length && <button className="server-primary-button" type="button" onClick={createRole}>Create Role</button>}
          </div>
        ) : (
          <>
            <header className="server-role-editor-header">
              <h2>{isNewRole ? "Create Role" : `Edit Role — ${roleDraft.name}`}</h2>
            </header>
            <div className="server-role-display-panel">
                <div className="server-role-field">
                  <label className="server-form-label" htmlFor="server-role-name">ROLE NAME</label>
                  <input
                    id="server-role-name"
                    className="server-form-input"
                    type="text"
                    maxLength={32}
                    autoComplete="off"
                    value={roleDraft.name}
                    onChange={event => { setRoleDraft({ ...roleDraft, name: event.target.value }); setRoleError(""); }}
                  />
                </div>
                <fieldset className="server-role-color-field">
                  <legend className="server-form-label">ROLE COLOR</legend>
                  <div className="server-role-color-grid">
                    {ROLE_COLOR_OPTIONS.map(color => (
                      <button
                        key={color}
                        className={`server-role-color-swatch${roleDraft.color.toLowerCase() === color.toLowerCase() ? " is-selected" : ""}`}
                        style={{ backgroundColor: color }}
                        type="button"
                        aria-label={`Choose role color ${color}`}
                        aria-pressed={roleDraft.color.toLowerCase() === color.toLowerCase()}
                        onClick={() => setRoleDraft({ ...roleDraft, color })}
                      >
                        {roleDraft.color.toLowerCase() === color.toLowerCase() ? "✓" : ""}
                      </button>
                    ))}
                  </div>
                </fieldset>
                {roleError && <div className="server-form-error" role="alert">{roleError}</div>}
                <div className="server-role-save-row">
                  <button className="server-primary-button" type="button" disabled={!roleDraft.name.trim()} onClick={saveRole}>Save</button>
                </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function MemberIdentity({ member }: { member: ServerMember }) {
  return (
    <span className="server-role-member-identity">
      <span className="server-role-member-avatar">
        {member.avatar ? <img src={member.avatar} alt="" /> : <span>{member.displayName.trim().charAt(0).toUpperCase() || "?"}</span>}
      </span>
      <span className="server-role-member-copy">
        <span className="server-role-member-name">{member.displayName}{member.isCurrentUser ? " (you)" : ""}</span>
        <span className="server-role-member-handle">@{member.username}</span>
      </span>
    </span>
  );
}

function ServerMembersSection({
  server,
  members,
  onToggleMemberRole,
}: {
  server: TalkyServer;
  members: ServerMember[];
  onToggleMemberRole: (memberId: string, roleId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const visibleMembers = members.filter(member =>
    `${member.displayName} ${member.username}`.toLowerCase().includes(search.trim().toLowerCase())
  );
  return (
    <section className="server-settings-members" aria-label="Server members">
      <div className="server-settings-section-heading">
        <h2>Members</h2>
        <span>{members.length}</span>
      </div>
      <input
        className="server-role-search-input"
        type="search"
        placeholder="Search members"
        aria-label="Search members"
        value={search}
        onChange={event => setSearch(event.target.value)}
      />
      <div className="server-settings-member-list">
        {visibleMembers.map(member => {
          const assignedRoleIds = server.roleAssignments[member.id] || [];
          const assignedRoles = server.roles.filter(role => assignedRoleIds.includes(role.id));
          return (
            <div className="server-settings-member-card" key={member.id}>
              <div className="server-settings-member-row">
                <MemberIdentity member={member} />
                <MemberRolePicker member={member} roles={server.roles} assignedRoleIds={assignedRoleIds} onToggleRole={roleId => onToggleMemberRole(member.id, roleId)} />
              </div>
              <div className="server-settings-member-roles">
                {assignedRoles.length ? assignedRoles.map(role => (
                  <span className="server-role-chip" key={role.id}>
                    <span className="server-role-dot" style={{ backgroundColor: role.color }} />{role.name}
                  </span>
                )) : <span className="server-role-empty">No roles assigned</span>}
              </div>
            </div>
          );
        })}
        {!visibleMembers.length && <div className="server-role-list-empty">No members match your search.</div>}
      </div>
    </section>
  );
}

export function ServerSettingsPage({
  server,
  members,
  onClose,
  onSave,
  onToggleMemberRole,
}: {
  server: TalkyServer;
  members: ServerMember[];
  onClose: () => void;
  onSave: (patch: Partial<Pick<TalkyServer, "name" | "description" | "icon" | "banner" | "roles" | "roleAssignments">>) => void;
  onToggleMemberRole: (memberId: string, roleId: string) => void;
}) {
  const iconInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [settingsSection, setSettingsSection] = useState<"overview" | "roles" | "members">("overview");
  const [draftServer, setDraftServer] = useState(server);
  const hasUnsavedChanges = server.name !== draftServer.name ||
    server.description !== draftServer.description ||
    server.icon !== draftServer.icon ||
    server.banner !== draftServer.banner;

  const updateDraft = (patch: Partial<Pick<TalkyServer, "name" | "description" | "icon" | "banner">>) => {
    setDraftServer(current => ({ ...current, ...patch }));
  };

  const handleSave = () => {
    const savedDraft = {
      name: draftServer.name.trim() || "My Server",
      description: draftServer.description,
      icon: draftServer.icon,
      banner: draftServer.banner,
    };
    onSave(savedDraft);
    setDraftServer(current => ({ ...current, ...savedDraft }));
  };

  const uploadImage = async (event: React.ChangeEvent<HTMLInputElement>, field: "icon" | "banner") => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    try {
      const dataUrl = await readImageFile(file);
      if (field === "icon") updateDraft({ icon: dataUrl });
      else updateDraft({ banner: dataUrl });
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read that image.");
    }
  };

  useEffect(() => {
    setDraftServer(server);
    setError("");
    setSettingsSection("overview");
  }, [server.id]);

  return (
    <section className="server-settings-overlay" role="dialog" aria-modal="true" aria-labelledby="server-settings-title">
      <aside className="server-settings-nav">
        <div className="server-settings-nav-heading">SERVER SETTINGS</div>
        <div className="server-settings-nav-name">{draftServer.name}</div>
        {(["overview", "roles", "members"] as const).map(section => (
          <button
            key={section}
            className="server-settings-nav-item"
            type="button"
            aria-current={settingsSection === section ? "page" : undefined}
            onClick={() => setSettingsSection(section)}
          >
            {section === "overview" ? "Overview" : section === "roles" ? "Roles" : "Members"}
          </button>
        ))}
      </aside>
      <main className="server-settings-main">
        <div className="server-settings-content">
          <header className="server-settings-header">
            <div>
              <div className="server-settings-eyebrow">{draftServer.name}</div>
              <h1 className="server-settings-heading" id="server-settings-title">
                {settingsSection === "overview" ? "Server Settings" : settingsSection === "roles" ? "Roles" : "Members"}
              </h1>
            </div>
            <button className="server-settings-close" type="button" aria-label="Close Server Settings" onClick={onClose}>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
              <span>ESC</span>
            </button>
          </header>

          {settingsSection === "overview" && <div className="server-settings-grid">
            <form className="server-settings-form" onSubmit={event => event.preventDefault()}>
              <div className="server-settings-field">
                <label className="server-form-label" htmlFor="server-settings-name">SERVER NAME</label>
                <input
                  id="server-settings-name"
                  className="server-form-input"
                  type="text"
                  maxLength={64}
                  value={draftServer.name}
                  onChange={event => updateDraft({ name: event.target.value })}
                />
              </div>

              <div className="server-settings-field">
                <label className="server-form-label">SERVER ICON</label>
                <div className="server-upload-row">
                  <span className="server-upload-avatar server-settings-avatar">
                    {draftServer.icon ? <img src={draftServer.icon} alt="Server icon preview" /> : <span>{draftServer.name.trim().charAt(0).toUpperCase() || "✦"}</span>}
                  </span>
                  <button className="server-secondary-button" type="button" onClick={() => iconInputRef.current?.click()}>Upload Icon</button>
                  {draftServer.icon && <button className="server-text-button" type="button" onClick={() => updateDraft({ icon: "" })}>Remove</button>}
                  <input ref={iconInputRef} type="file" accept="image/*" aria-label="Upload server icon" hidden onChange={event => uploadImage(event, "icon")} />
                </div>
              </div>

              <div className="server-settings-field">
                <label className="server-form-label">SERVER BANNER</label>
                <div className="server-banner-upload-preview">
                  {draftServer.banner ? <img src={draftServer.banner} alt="Server banner preview" /> : <span>No banner uploaded</span>}
                </div>
                <div className="server-upload-row">
                  <button className="server-secondary-button" type="button" onClick={() => bannerInputRef.current?.click()}>Upload Banner</button>
                  {draftServer.banner && <button className="server-text-button" type="button" onClick={() => updateDraft({ banner: "" })}>Remove</button>}
                  <input ref={bannerInputRef} type="file" accept="image/*" aria-label="Upload server banner" hidden onChange={event => uploadImage(event, "banner")} />
                </div>
              </div>

              <div className="server-settings-field">
                <label className="server-form-label" htmlFor="server-settings-description">DESCRIPTION</label>
                <textarea
                  id="server-settings-description"
                  className="server-form-textarea"
                  maxLength={300}
                  placeholder="Tell people what your server is about."
                  value={draftServer.description}
                  onChange={event => updateDraft({ description: event.target.value })}
                />
                <div className="server-description-count">{draftServer.description.length}/300</div>
              </div>
              {error && <div className="server-form-error" role="alert">{error}</div>}
            </form>

            <aside className="server-preview-column">
              <div className="server-preview-label">SERVER CARD PREVIEW</div>
              <article className="server-preview-card">
                <div className="server-preview-banner">
                  {draftServer.banner ? <img src={draftServer.banner} alt="" /> : null}
                </div>
                <div className="server-preview-body">
                  <div className="server-preview-icon">
                    {draftServer.icon ? <img src={draftServer.icon} alt="" /> : <span>{draftServer.name.trim().charAt(0).toUpperCase() || "✦"}</span>}
                  </div>
                  <h2>{draftServer.name.trim() || "Your server"}</h2>
                  <p>{draftServer.description.trim() || "Your server description will appear here."}</p>
                </div>
              </article>
              <div className="server-preview-footnote">Preview updates as you edit. Save Changes to apply.</div>
            </aside>
          </div>}

          {settingsSection === "roles" && (
            <ServerRolesSection
              server={server}
              members={members}
              onSaveRoles={roles => onSave({ roles })}
            />
          )}

          {settingsSection === "members" && (
            <ServerMembersSection server={server} members={members} onToggleMemberRole={onToggleMemberRole} />
          )}
        </div>
        {settingsSection === "overview" && hasUnsavedChanges && (
          <div className="unsaved-notice-container server-unsaved-notice-container">
            <div className="unsaved-notice-bar" role="alert">
              <span className="unsaved-notice-text">Careful — you have unsaved changes!</span>
              <div className="unsaved-notice-actions">
                <button className="unsaved-reset-btn" type="button" onClick={() => { setDraftServer(server); setError(""); }}>Reset</button>
                <button className="unsaved-save-btn" type="button" onClick={handleSave}>Save Changes</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </section>
  );
}
