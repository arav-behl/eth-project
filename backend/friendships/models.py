from django.db import models


class Profile(models.Model):
    ens_name = models.CharField(max_length=255, unique=True)
    address = models.CharField(max_length=42, blank=True, null=True)
    avatar = models.URLField(blank=True, null=True)
    display_name = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "profiles"

    def __str__(self) -> str:
        return self.ens_name


class Friendship(models.Model):
    profile_a = models.ForeignKey(
        Profile,
        on_delete=models.CASCADE,
        related_name="friendships_as_a",
    )
    profile_b = models.ForeignKey(
        Profile,
        on_delete=models.CASCADE,
        related_name="friendships_as_b",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "friendships"
        constraints = [
            models.UniqueConstraint(
                fields=["profile_a", "profile_b"],
                name="unique_friendship_pair",
            ),
            models.CheckConstraint(
                check=models.Q(profile_a__lt=models.F("profile_b")),
                name="profile_a_lt_profile_b",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.profile_a.ens_name} <-> {self.profile_b.ens_name}"
