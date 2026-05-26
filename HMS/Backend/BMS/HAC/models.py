
from django.db import models
from django.utils import timezone
import random
import string

def generate_owner_id():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=10))

STAY_TYPE_CHOICES = [
    ('hostel', 'Hostel'),
    ('apartment', 'Apartment'),
    ('commercial', 'Commercial'),
]


# ------------------ OWNERS ------------------
# class Owners(models.Model):
#     name = models.CharField(max_length=150)
#     email = models.EmailField(unique=True)
#     phone = models.CharField(max_length=15)
#     password = models.CharField(max_length=255)
#     owner_img_field = models.FileField(
#         upload_to="identity_proofs/",
#         blank=True,
#         null=True
#     )

#     def __str__(self):
#         return self.name

class Owners(models.Model):
    owner_id = models.CharField(max_length=10, primary_key=True, default=generate_owner_id, editable=False)
    name = models.CharField(max_length=150)
    phone = models.CharField(max_length=15, unique=True)
    password = models.CharField(max_length=255)
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('pending', 'Pending'),
        ('suspend', 'Suspend'),
    ]
    status = models.CharField(choices=STATUS_CHOICES, max_length=20, default='pending')
 
     # ✅ ADD THIS LINE
    created_at = models.DateTimeField(default=timezone.now)
    suspension_reason = models.TextField(blank=True, null=True)
    push_token = models.CharField(max_length=255, blank=True, null=True)
 
    def __str__(self):
        return self.name
   
 
# ------------------ HOSTEL ------------------
class StayHostelDetails(models.Model):
    HOSTEL_TYPE_CHOICES = [
        ('boys', 'Boys'),
        ('girls', 'Girls'),
        ('coliving', 'Co-Living'),
    ]
 
    owner = models.ForeignKey(
        Owners,
        on_delete=models.CASCADE,
        related_name="stay_details"
    )
 
    stayType = models.CharField(max_length=20, choices=STAY_TYPE_CHOICES)
    hostelName = models.CharField(max_length=150, null=True, blank=True)
    location = models.CharField(max_length=255)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    hostelType = models.CharField(max_length=20, choices=HOSTEL_TYPE_CHOICES, blank=True, null=True)
    facilities = models.JSONField(blank=True, null=True)
    gallery_images = models.JSONField(blank=True, null=True)
    rent_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    cover_image = models.ImageField(upload_to='property_covers/', null=True, blank=True)
 
    def __str__(self):
        return self.hostelName or "Hostel"
 
 
# ------------------ APARTMENT ------------------
class ApartmentStayDetails(models.Model):
    BHK_CHOICES = [
        ('1', '1 BHK'),
        ('2', '2 BHK'),
        ('3', '3 BHK'),
    ]
 
    TENANT_TYPE_CHOICES = [
        ('family', 'Family'),
        ('bachelors', 'Bachelors'),
    ]
 
    owner = models.ForeignKey(
        Owners,
        on_delete=models.CASCADE,
        related_name='apartments'
    )
 
    stayType = models.CharField(max_length=20, choices=STAY_TYPE_CHOICES)
    apartmentName = models.CharField(max_length=150, null=True, blank=True)
    location = models.CharField(max_length=255)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    # bhk = models.CharField(max_length=10, choices=BHK_CHOICES)
    tenantType = models.CharField(max_length=20, choices=TENANT_TYPE_CHOICES, null=True, blank=True)
    facilities = models.JSONField(blank=True, null=True)
    gallery_images = models.JSONField(blank=True, null=True)
    
    FURNISHING_CHOICES = [
        ('Fully Furnished', 'Fully Furnished'),
        ('Semi Furnished', 'Semi Furnished'),
        ('Unfurnished', 'Unfurnished'),
    ]
    furnishing_type = models.CharField(max_length=20, choices=FURNISHING_CHOICES, null=True, blank=True)
    rent_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    cover_image = models.ImageField(upload_to='property_covers/', null=True, blank=True)
 
    def __str__(self):
        return f"{self.apartmentName} - {self.bhk}"
 
 
# ------------------ COMMERCIAL ------------------
class CommericialDetails(models.Model):
    USAGE_CHOICES = [
        ('lease', 'Lease'),
        ('rent', 'Rent'),
    ]
 
    owner = models.ForeignKey(
        Owners,
        on_delete=models.CASCADE,
        related_name='commercial'
    )
 
    stayType = models.CharField(max_length=20, choices=STAY_TYPE_CHOICES)
    commercialName = models.CharField(max_length=255, blank=True, null=True)
    location = models.CharField(max_length=255)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    usage = models.CharField(max_length=20, choices=USAGE_CHOICES, blank=True, null=True)
    facilities = models.JSONField(blank=True, null=True)
    gallery_images = models.JSONField(blank=True, null=True)
    rent_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    cover_image = models.ImageField(upload_to='property_covers/', null=True, blank=True)
 
 
    def __str__(self):
        return self.commercialName or "Commercial Property"


# ------------------ BANK ------------------



# ------------------ HOSTEL FLOORS ------------------
class HostelFloorRoom(models.Model):
    owner = models.ForeignKey(
        Owners,
        on_delete=models.CASCADE,
        related_name='hostel_floors'
    )

    hostel = models.ForeignKey(
        StayHostelDetails,
        on_delete=models.CASCADE,
        related_name='floors'
    )

    floor = models.IntegerField()
    roomNo = models.PositiveIntegerField()
    sharing = models.PositiveIntegerField()

    class Meta:
        ordering = ['roomNo']
        unique_together = ('hostel', 'floor', 'roomNo')

    def __str__(self):
        return f"{self.hostel.hostelName} - Floor {self.floor} Room {self.roomNo} ({self.sharing} beds)"
    # floorNo = models.IntegerField()
    # roomNo = models.PositiveIntegerField()
    # beds = models.PositiveIntegerField()

    # class Meta:
    #     ordering = ['roomNo']
    #     unique_together = ('hostel', 'floorNo', 'roomNo')

    # def __str__(self):
    #     return f"{self.hostel.hostelName} - Floor {self.floorNo} Room {self.roomNo} ({self.beds} beds)"


# ------------------ APARTMENT FLOORS ------------------
class ApartmentFloorUnit(models.Model):
    owner = models.ForeignKey(
        Owners,
        on_delete=models.CASCADE,
        related_name='apartment_floors'
    )

    apartment = models.ForeignKey(
        ApartmentStayDetails,
        on_delete=models.CASCADE,
        related_name='floors'
    )

    floor = models.IntegerField()
    flatNo = models.PositiveIntegerField()
    bhk = models.PositiveIntegerField()

    def __str__(self):
        return f"{self.apartment.apartmentName} - Floor {self.floor} Flat {self.flatNo} ({self.bhk} BHK)"


# ------------------ COMMERCIAL FLOORS ------------------
# class CommercialFloor(models.Model):
#     owner = models.ForeignKey(
#         Owners,
#         on_delete=models.CASCADE,
#         related_name='commercial_floors'
#     )

#     commercial_property = models.ForeignKey(
#         CommericialDetails,
#         on_delete=models.CASCADE,
#         related_name='floors'
#     )

#     floorNo = models.PositiveIntegerField()
#     area_sqft = models.PositiveIntegerField(null=True, blank=True)

#     def __str__(self):
#         return f"{self.commercial_property.commercialName} - Floor {self.floorNo} ({self.area_sqft} sqft)"
class CommercialFloor(models.Model):

    owner = models.ForeignKey(
        Owners,
        on_delete=models.CASCADE,
        related_name='commercial_floors'
    )

    commercial_property = models.ForeignKey(
        CommericialDetails,
        on_delete=models.CASCADE,
        related_name='floors'
    )

    floorNo = models.PositiveIntegerField()

    sectionNo = models.PositiveIntegerField(null=True, blank=True)

    area_sqft = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        ordering = ["floorNo", "sectionNo"]

    def __str__(self):
        return f"{self.commercial_property.commercialName} - Floor {self.floorNo} Section {self.sectionNo}"


class Tenent(models.Model):
    owner = models.ForeignKey(Owners, on_delete=models.SET_NULL, null=True, blank=True)
    name = models.CharField(max_length=100)
    phone = models.CharField(max_length=15)
    push_token = models.CharField(max_length=255, blank=True, null=True)
 
 
    def __str__(self):
        return self.name

class TenantBeds(models.Model):
    # owner = models.ForeignKey(Owners,on_delete=models.CASCADE, related_name="tenants", null=True,blank=True)
    owner_phone = models.CharField(max_length=15, null=True, blank=True)
    name = models.CharField(max_length=150)
    phone = models.CharField(max_length=15)
    bed = models.IntegerField()
    floor = models.IntegerField(null=True, blank=True)
    roomno = models.IntegerField(null=True, blank=True)
    rent = models.DecimalField(max_digits=10, decimal_places=2)
    checkIn = models.DateField()
    checkOut = models.DateField(null=True, blank=True)
    payment_screenshot = models.ImageField(
    upload_to='payment_screenshots/',
    null=True,
    blank=True
    )

    def __str__(self):
        return self.name


class ApartmentTenantBeds(models.Model):
    # owner = models.ForeignKey(Owners,on_delete=models.CASCADE, related_name="tenants", null=True,blank=True)
    owner_phone = models.CharField(max_length=15, null=True, blank=True)
    name = models.CharField(max_length=150)
    phone = models.CharField(max_length=15)
    floor = models.IntegerField(null=True, blank=True)
    flatno = models.IntegerField(null=True, blank=True)
    rent = models.DecimalField(max_digits=10, decimal_places=2)
    checkIn = models.DateField()
    checkOut = models.DateField(null=True, blank=True)
    payment_screenshot = models.ImageField(
        upload_to='payment_screenshots/',
        null=True,
        blank=True
    )

    def __str__(self):
        return self.name
    
class CommercialTenantBeds(models.Model):
    # owner = models.ForeignKey(Owners,on_delete=models.CASCADE, related_name="tenants", null=True,blank=True)
    owner_phone = models.CharField(max_length=15, null=True, blank=True)
    name = models.CharField(max_length=150)
    phone = models.CharField(max_length=15)
    floor = models.IntegerField(null=True, blank=True)
    sectionNo = models.IntegerField(null=True, blank=True)
    rent = models.DecimalField(max_digits=10, decimal_places=2)
    checkIn = models.DateField()
    checkOut = models.DateField(null=True, blank=True)
    payment_screenshot = models.ImageField(
        upload_to='payment_screenshots/',
        null=True,
        blank=True
    )

    def __str__(self):
        return self.name
    
    
class JoinRequest(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('accepted', 'Accepted'),
        ('rejected', 'Rejected'),
        ('withdrawn', 'Withdrawn'),
    ]
 
    tenant = models.ForeignKey(Tenent, on_delete=models.CASCADE)
    owner = models.ForeignKey(Owners, on_delete=models.CASCADE)
    property_name = models.CharField(max_length=200, null=True, blank=True)
    property_type = models.CharField(max_length=50, null=True, blank=True)
    check_in = models.CharField(max_length=50, null=True, blank=True)
    check_out = models.CharField(max_length=50, null=True, blank=True)
    sharing = models.CharField(max_length=50, null=True, blank=True)
    flat = models.CharField(max_length=50, null=True, blank=True)
    section = models.CharField(max_length=50, null=True, blank=True)
 
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending'
    )
 
    created_at = models.DateTimeField(auto_now_add=True)
 
    def __str__(self):
        return f"{self.tenant.name} → {self.owner.name} ({self.status})"






class Issue(models.Model):

    SEVERITY_CHOICES = [
        ('Low', 'Low'),
        ('Medium', 'Medium'),
        ('High', 'High'),
    ]

    STATUS_CHOICES = [
        ('Pending', 'Pending'),
        ('In Progress', 'In Progress'),
        ('Completed', 'Completed'),
    ]

    # 🔗 RELATIONS
    tenant = models.ForeignKey(Tenent, on_delete=models.CASCADE)
    owner = models.ForeignKey(Owners, on_delete=models.CASCADE)

    # 🧾 ISSUE DETAILS (FROM YOUR FORM)
    title = models.CharField(max_length=255)  # SUBJECT
    description = models.TextField()

    severity = models.CharField(   # ✅ THIS MATCHES YOUR UI
        max_length=10,
        choices=SEVERITY_CHOICES,
        default='Medium'
    )

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='Pending'
    )

    # 📷 IMAGE (Attach File)
    image = models.ImageField(
        upload_to='issue_images/',
        null=True,
        blank=True
    )

    # 💬 OWNER RESPONSE
    owner_comment = models.TextField(null=True, blank=True)

    # 📅 TIMESTAMP
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.title} - {self.severity}"


class Payment(models.Model):
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('SUCCESS', 'Success'),
        ('FAILED', 'Failed'),
    ]

    tenant_phone = models.CharField(max_length=15, null=True, blank=True)

    tenant_name = models.CharField(max_length=255, blank=True, null=True)
    owner_phone = models.CharField(max_length=15)

    owner_name = models.CharField(max_length=255)

    property_name = models.CharField(max_length=255)

    upi_id = models.CharField(max_length=255)

    amount = models.FloatField()

    txn_ref = models.CharField(max_length=100, unique=True)

    status = models.CharField(
        max_length=10,
        choices=STATUS_CHOICES,
        default='PENDING'
    )

    payment_screenshot = models.ImageField(
        upload_to='payment_screenshots/',
        null=True,
        blank=True
    )

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.tenant_phone} - {self.amount} - {self.status}"

class BankDetails(models.Model):
    owner = models.ForeignKey(
        Owners,
        on_delete=models.CASCADE,
        related_name="bank_details"
    )
 
    bankName = models.CharField(max_length=150, null=True, blank=True)
    ifsc = models.CharField(max_length=20, null=True, blank=True)
    accountNo = models.CharField(max_length=30, null=True, blank=True)
    upi_id = models.CharField(max_length=150, null=True, blank=True)
    qr_code = models.ImageField(upload_to='bank_qr_codes/', null=True, blank=True)
 
    def __str__(self):
        return f"{self.bankName} - {self.accountNo}"
 
class Expense(models.Model):
    owner = models.ForeignKey(
        Owners,
        on_delete=models.CASCADE,
        related_name="expenses",
        null=True,
        blank=True
    )
    category = models.CharField(max_length=100)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    date = models.DateField()
    description = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.category} - {self.amount} ({self.owner.name})"


class Notification(models.Model):
    TYPE_CHOICES = [
        ('ISSUE', 'Issue'),
        ('PAYMENT', 'Payment'),
        ('JOIN_REQUEST', 'Join Request'),
    ]

    recipient_phone = models.CharField(max_length=15)
    title = models.CharField(max_length=255)
    message = models.TextField()
    type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='ISSUE')
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    related_id = models.IntegerField(null=True, blank=True)

    def __str__(self):
        return f"{self.title} - {self.recipient_phone}"
 